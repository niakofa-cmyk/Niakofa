/**
 * Nia Check-in Worker
 *
 * Runs every hour. Finds help requests that were completed ~24 hours ago
 * and haven't had a check-in sent yet. For each one, it:
 *
 *  1. Calls the nia-service /checkin endpoint (streams Nia's opening message)
 *  2. Sends a push notification to the requester inviting them to continue
 *     the conversation with Nia in-app
 *  3. Marks the request as checked-in so we don't double-send
 *
 * Push uses web-push via the push_subscriptions table — NOT a push_token
 * column on users (that column does not exist).
 *
 * The check-in window is "completed between 23h and 25h ago" so we catch
 * everything that falls in the hourly scan gap regardless of server timing.
 */

import { db, requestsTable, usersTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { sendPushToUser } from "../routes/push";
import { logger } from "../lib/logger";

const NIA_SERVICE_URL = process.env.NIA_SERVICE_URL ?? "http://localhost:3001";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

const ONE_HOUR_MS = 60 * 60 * 1000;

async function processNiaCheckins(): Promise<void> {
  // Find requests completed 23–25 hours ago that haven't been checked-in yet.
  // We use a dedicated column `nia_checkin_sent_at` to track this; add a
  // migration if it doesn't exist yet (see migrate.sql note below).
  let due: {
    id: number;
    title: string;
    category: string;
    requester_id: number;
    helper_id: number | null;
    requester_name: string | null;
    helper_name: string | null;
  }[] = [];

  try {
    const rows = await db.execute(sql`
      SELECT
        r.id,
        r.title,
        r.category,
        r.requester_id,
        r.helper_id,
        u_req.name  AS requester_name,
        u_hlp.name  AS helper_name
      FROM help_requests r
      JOIN users u_req ON u_req.id = r.requester_id
      LEFT JOIN users u_hlp ON u_hlp.id = r.helper_id
      WHERE r.status = 'completed'
        AND r.completed_at  >= NOW() - INTERVAL '25 hours'
        AND r.completed_at  <  NOW() - INTERVAL '23 hours'
        AND r.nia_checkin_sent_at IS NULL
      LIMIT 50
    `);
    due = rows.rows as typeof due;
  } catch (err) {
    logger.error({ err }, "nia-checkin: failed to query due check-ins");
    return;
  }

  if (due.length === 0) return;

  logger.info({ count: due.length }, "nia-checkin: processing check-ins");

  for (const req of due) {
    try {
      // 1. Generate the check-in session ID (stable for this request)
      const sessionId = `checkin-${req.requester_id}-${req.id}`;

      // 2. Call nia-service to generate Nia's opening message and save
      //    the conversation (fire-and-forget — we don't need to wait for
      //    full streaming, just kick it off)
      const niaPayload = {
        userId: req.requester_id,
        requestId: req.id,
        requestTitle: req.title,
        category: req.category,
        helperName: req.helper_name ?? null,
        sessionId,
      };

      // We POST and let it stream; we don't need to read the response here
      // because nia-service saves the conversation to nia_conversations itself.
      fetch(`${NIA_SERVICE_URL}/checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        body: JSON.stringify(niaPayload),
      }).catch((err) =>
        logger.warn({ err, requestId: req.id }, "nia-checkin: nia-service call failed")
      );

      // 3. Send a push notification so the user knows Nia reached out
      await sendPushToUser(req.requester_id, {
        title: "💙 Nia checked in on you",
        body: `How did ${req.title} go? Tap to chat with Nia.`,
        urgency: "normal",
        requestId: req.id,
      }).catch((err) =>
        logger.warn({ err, userId: req.requester_id }, "nia-checkin: push failed")
      );

      // 4. Mark as sent so we don't re-send
      await db.execute(sql`
        UPDATE help_requests
        SET nia_checkin_sent_at = NOW()
        WHERE id = ${req.id}
      `);

      logger.info(
        { requestId: req.id, userId: req.requester_id },
        "nia-checkin: sent"
      );
    } catch (err) {
      logger.error({ err, requestId: req.id }, "nia-checkin: failed for request");
      // Continue to next — don't let one failure block the batch
    }
  }
}

export function startNiaCheckinWorker(): () => void {
  // Run once immediately, then every hour
  processNiaCheckins().catch((err) =>
    logger.error({ err }, "nia-checkin: initial run failed")
  );

  const interval = setInterval(
    () =>
      processNiaCheckins().catch((err) =>
        logger.error({ err }, "nia-checkin: scheduled run failed")
      ),
    ONE_HOUR_MS
  );

  return () => clearInterval(interval);
}

/*
 * MIGRATION NOTE
 * ──────────────
 * Add this column to help_requests if it doesn't exist:
 *
 *   ALTER TABLE help_requests
 *     ADD COLUMN IF NOT EXISTS nia_checkin_sent_at TIMESTAMPTZ;
 *
 *   CREATE INDEX IF NOT EXISTS help_requests_nia_checkin_idx
 *     ON help_requests (completed_at, nia_checkin_sent_at)
 *     WHERE status = 'completed' AND nia_checkin_sent_at IS NULL;
 *
 * Also needed in your Drizzle schema (lib/db/src/schema/requests.ts):
 *
 *   nia_checkin_sent_at: timestamp("nia_checkin_sent_at", { withTimezone: true }),
 */
