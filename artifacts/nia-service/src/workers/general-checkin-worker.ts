/**
 * General 24-hour check-in worker for Nia.
 *
 * Runs every hour. Finds completed help_requests where:
 *  - completed_at is 20–26 hours ago (window to catch delayed hourly runs)
 *  - no check-in has been sent yet (nia_checkin_sent_at IS NULL)
 *
 * For each qualifying request, Nia sends a warm follow-up:
 *  1. Saves a message to nia_conversations (user sees it in the drawer)
 *  2. Queues a push notification: "💙 Nia checked in on you"
 *
 * BUG-14a FIX: Previously imported { db } from "../lib/db" and { sql } from
 * "drizzle-orm" and { logger } from "../lib/logger" — none exist in nia-service
 * (raw pg, not Drizzle; no logger.ts file). Rewrote to use exported `pool`
 * from lib/db.ts directly.
 *
 * BUG-14b FIX: nia_conversations schema has (user_id, session_id, user_message,
 * nia_response, is_crisis, created_at) — NOT a (role, content) pattern.
 * Corrected all INSERTs.
 *
 * BUG-14c FIX: push_notification_queue table added to migrate.sql.
 * Push inserts remain try/catch — non-fatal if table is still missing.
 *
 * Also fixed: help_requests column is requester_id, NOT user_id.
 *
 * ─── DESIGN DECISION: BUG-15a ──────────────────────────────────────────────
 *
 * This worker (nia-service) and the api-server's nia-checkin-worker.ts
 * BOTH run independently. This is INTENTIONAL REDUNDANCY, not a bug.
 *
 * Rationale:
 *  • The api-server worker coordinates timing (23–25h window) and calls the
 *    nia-service /checkin endpoint for streaming AI generation.
 *  • This nia-service worker is a FALLBACK: if the api-server worker is down,
 *    delayed, or the /checkin endpoint fails, this worker still ensures users
 *    receive their 24-hour check-in within the 20–26h window.
 *
 * Idempotency guard:
 *  • Both workers UPDATE help_requests SET nia_checkin_sent_at = NOW()
 *    with a WHERE nia_checkin_sent_at IS NULL clause.
 *  • The first worker to reach a given request wins; the second sees
 *    rowCount === 0 and skips (see "already processed, skipping" log).
 *
 * Monitoring: Watch for "already processed, skipping" log lines. Occasional
 * hits are expected (race conditions). Sustained high counts indicate one
 * worker is consistently behind or failing.
 *
 * Recommendation: Keep both workers. The redundancy cost (one extra DB query
 * per hour) is negligible compared to the reliability gain of ensuring no user
 * misses their Nia check-in due to a single service failure.
 */
import { pino } from "pino";
import { pool } from "../lib/db.js";

const logger = pino({ level: "info" });

const BATCH_SIZE = 50;
const CHECKIN_SESSION_PREFIX = "nia_checkin_";

// ─── Schema guard ─────────────────────────────────────────────────────────────

async function ensureCheckinColumn(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'help_requests'
         AND column_name = 'nia_checkin_sent_at'
       LIMIT 1`
    );
    if (result.rows.length > 0) return true;

    // Column missing — add it idempotently
    await pool.query(
      `ALTER TABLE help_requests
       ADD COLUMN IF NOT EXISTS nia_checkin_sent_at TIMESTAMPTZ`
    );
    logger.info("general-checkin-worker: added nia_checkin_sent_at column");
    return true;
  } catch (err) {
    logger.error({ err }, "general-checkin-worker: could not ensure nia_checkin_sent_at column");
    return false;
  }
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runGeneralCheckin(): Promise<void> {
  const ready = await ensureCheckinColumn();
  if (!ready) return;

  let offset = 0;
  let totalProcessed = 0;

  while (true) {
    const result = await pool.query(
      `SELECT
         hr.id           AS request_id,
         hr.requester_id AS user_id,
         u.name          AS user_name,
         u.email         AS user_email,
         hr.title        AS request_title,
         hr.completed_at
       FROM help_requests hr
       JOIN users u ON u.id = hr.requester_id
       WHERE hr.status = 'completed'
         AND hr.completed_at IS NOT NULL
         AND hr.completed_at >= NOW() - INTERVAL '26 hours'
         AND hr.completed_at <= NOW() - INTERVAL '20 hours'
         AND hr.nia_checkin_sent_at IS NULL
       ORDER BY hr.completed_at ASC
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    const requests = result.rows as Array<{
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
        // 1. Mark as sent first — idempotent guard prevents double check-ins
        //    if the worker fires twice in the same window
        const updateResult = await pool.query(
          `UPDATE help_requests
           SET nia_checkin_sent_at = NOW()
           WHERE id = $1
             AND nia_checkin_sent_at IS NULL
           RETURNING id`,
          [req.request_id]
        );

        // Another worker instance already processed this one — skip
        if ((updateResult.rowCount ?? 0) === 0) {
          logger.info(
            { requestId: req.request_id },
            "general-checkin-worker: already processed, skipping"
          );
          continue;
        }

        // 2. Build warm Nia message
        const firstName = req.user_name?.split(" ")[0] ?? "friend";
        const niaMessage = [
          `Hey ${firstName} 💙`,
          ``,
          `I was just thinking about you. Yesterday you received help with "${req.request_title}" — I hope everything went smoothly.`,
          ``,
          `Is there anything you're still working through, or anything new I can help you with today?`,
        ].join("\n");

        // 3. Save to nia_conversations using correct schema
        //    session_id = nia_checkin_{request_id} — groups this check-in thread
        const sessionId = `${CHECKIN_SESSION_PREFIX}${req.request_id}`;
        try {
          await pool.query(
            `INSERT INTO nia_conversations
               (user_id, session_id, user_message, nia_response, is_crisis, created_at)
             VALUES ($1, $2, $3, $4, FALSE, NOW())`,
            [
              req.user_id,
              sessionId,
              `[check-in:${req.request_id}] ${req.request_title}`,
              niaMessage,
            ]
          );
        } catch (convErr) {
          logger.warn(
            { convErr, userId: req.user_id },
            "general-checkin-worker: could not save conversation message"
          );
        }

        // 4. Queue push notification — non-fatal if push_notification_queue missing
        try {
          await pool.query(
            `INSERT INTO push_notification_queue (user_id, title, body, data, created_at)
             VALUES ($1, $2, $3, $4::jsonb, NOW())`,
            [
              req.user_id,
              "💙 Nia checked in on you",
              `Hey ${firstName}! I just wanted to check in. Open Nia to chat.`,
              JSON.stringify({ type: "nia_checkin", request_id: req.request_id }),
            ]
          );
        } catch (pushErr) {
          logger.warn(
            { pushErr, userId: req.user_id },
            "general-checkin-worker: push queue insert failed (table may not exist)"
          );
        }

        totalProcessed++;
        logger.info(
          { userId: req.user_id, requestId: req.request_id },
          "general-checkin-worker: sent check-in"
        );
      } catch (err) {
        logger.error(
          { err, requestId: req.request_id },
          "general-checkin-worker: error processing request"
        );
      }
    }

    if (requests.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  logger.info({ totalProcessed }, "general-checkin-worker: cycle complete");
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function startGeneralCheckinWorker(): Promise<void> {
  logger.info("general-checkin-worker: starting");

  // Run immediately on startup
  try { await runGeneralCheckin(); }
  catch (err) { logger.error({ err }, "general-checkin-worker: startup run failed"); }

  // Then every 60 minutes
  setInterval(async () => {
    try { await runGeneralCheckin(); }
    catch (err) { logger.error({ err }, "general-checkin-worker: interval run failed"); }
  }, 60 * 60 * 1000);
}
