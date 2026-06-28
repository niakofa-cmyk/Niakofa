import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * General 24-hour check-in worker for Nia.
 *
 * Runs every hour. Finds completed help_requests where:
 *  - completed_at is 20–26 hours ago (window to catch if hourly run was delayed)
 *  - no check-in has been sent yet (nia_checkin_sent_at IS NULL)
 *
 * For each qualifying request, Nia sends a warm follow-up message:
 *  1. Saves a message to the conversation so user sees it when they open the drawer
 *  2. Queues a push notification: "💙 Nia checked in on you"
 *
 * Processed in batches of 50. Runs every 60 minutes.
 */

const BATCH_SIZE = 50;

// Check if the schema has the nia_checkin_sent_at column
async function hasCheckinColumn(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'help_requests'
        AND column_name = 'nia_checkin_sent_at'
      LIMIT 1
    `);
    return (result.rows ?? result as any[]).length > 0;
  } catch {
    return false;
  }
}

async function runGeneralCheckin(): Promise<void> {
  const hasColumn = await hasCheckinColumn();
  if (!hasColumn) {
    // Migrate: add the column if missing
    try {
      await db.execute(sql`
        ALTER TABLE help_requests
        ADD COLUMN IF NOT EXISTS nia_checkin_sent_at TIMESTAMPTZ
      `);
      logger.info("general-checkin-worker: added nia_checkin_sent_at column");
    } catch (err) {
      logger.error({ err }, "general-checkin-worker: could not add nia_checkin_sent_at column, skipping");
      return;
    }
  }

  let offset = 0;
  let totalProcessed = 0;

  while (true) {
    const rows = await db.execute(sql`
      SELECT
        hr.id         AS request_id,
        hr.user_id    AS user_id,
        u.name        AS user_name,
        u.email       AS user_email,
        hr.title      AS request_title,
        hr.completed_at
      FROM help_requests hr
      JOIN users u ON u.id = hr.user_id
      WHERE hr.status = 'completed'
        AND hr.completed_at IS NOT NULL
        AND hr.completed_at >= NOW() - INTERVAL '26 hours'
        AND hr.completed_at <= NOW() - INTERVAL '20 hours'
        AND hr.nia_checkin_sent_at IS NULL
      ORDER BY hr.completed_at ASC
      LIMIT ${BATCH_SIZE}
      OFFSET ${offset}
    `);

    const requests = (rows.rows ?? rows as any[]) as Array<{
      request_id: number;
      user_id: number;
      user_name: string;
      user_email: string;
      request_title: string;
      completed_at: Date;
    }>;

    if (requests.length === 0) break;

    logger.info({ count: requests.length, offset }, "general-checkin-worker: processing batch");

    for (const req of requests) {
      try {
        // 1. Mark as sent first (idempotent guard)
        await db.execute(sql`
          UPDATE help_requests
          SET nia_checkin_sent_at = NOW()
          WHERE id = ${req.request_id}
            AND nia_checkin_sent_at IS NULL
        `);

        // 2. Build warm Nia message
        const firstName = req.user_name?.split(" ")[0] ?? "friend";
        const niaMessage = [
          `Hey ${firstName} 💙`,
          ``,
          `I was just thinking about you. Yesterday you received help with "${req.request_title}" — I hope everything went smoothly.`,
          ``,
          `Is there anything you're still working through, or anything new I can help you with today?`,
        ].join("
");

        // 3. Save to nia_conversations so user sees it when they open the drawer
        //    Only saves if nia_conversations table exists
        try {
          await db.execute(sql`
            INSERT INTO nia_conversations (user_id, role, content, created_at)
            VALUES (
              ${req.user_id},
              'assistant',
              ${niaMessage},
              NOW()
            )
          `);
        } catch (convErr) {
          // Table might not exist yet — non-fatal
          logger.warn({ convErr, userId: req.user_id }, "general-checkin-worker: could not save conversation message");
        }

        // 4. Queue push notification via pg-based queue (non-blocking)
        try {
          await db.execute(sql`
            INSERT INTO push_notification_queue (user_id, title, body, data, created_at)
            VALUES (
              ${req.user_id},
              '💙 Nia checked in on you',
              ${`Hey ${firstName}! I just wanted to check in. Open Nia to chat.`},
              ${JSON.stringify({ type: "nia_checkin", request_id: req.request_id })}::jsonb,
              NOW()
            )
          `);
        } catch (pushErr) {
          // Push queue table might not exist — non-fatal
          logger.warn({ pushErr, userId: req.user_id }, "general-checkin-worker: could not queue push notification");
        }

        totalProcessed++;
        logger.info({ userId: req.user_id, requestId: req.request_id }, "general-checkin-worker: sent check-in");
      } catch (err) {
        logger.error({ err, requestId: req.request_id }, "general-checkin-worker: error processing request");
      }
    }

    if (requests.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  logger.info({ totalProcessed }, "general-checkin-worker: cycle complete");
}

// ── Main entry: run once on startup then every 60 minutes ────────────────────
export async function startGeneralCheckinWorker(): Promise<void> {
  logger.info("general-checkin-worker: starting");
  
  // Run immediately on startup
  try {
    await runGeneralCheckin();
  } catch (err) {
    logger.error({ err }, "general-checkin-worker: startup run failed");
  }

  // Then every 60 minutes
  setInterval(async () => {
    try {
      await runGeneralCheckin();
    } catch (err) {
      logger.error({ err }, "general-checkin-worker: interval run failed");
    }
  }, 60 * 60 * 1000);
}
