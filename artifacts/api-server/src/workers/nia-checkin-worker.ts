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
 *
 * Both the api-server and nia-service workers may discover the same request.
 * They coordinate with a PostgreSQL advisory lock keyed by request id. The
 * winner re-checks nia_checkin_sent_at, performs the side effect, and only
 * marks the request sent after Nia has successfully persisted the check-in.
 * Failed Nia generation leaves nia_checkin_sent_at NULL so a later run can
 * retry.

import { db, systemSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendPushToUser } from "../routes/push";
import { logger } from "../lib/logger";

import { requestNia } from "../lib/nia-client";

const ONE_HOUR_MS = 60 * 60 * 1000;

// ── Nia kill-switch check ─────────────────────────────────────────────────────
// Nia workers must honour the admin kill-switch. If nia_enabled != "true" in
// system_settings, skip the check-in batch entirely — no AI calls, no push.
// Fail-closed: a missing DB row or a query error means Nia is disabled.
async function isNiaEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    return row?.value === "true";
  } catch {
    return false; // fail-closed: DB error → Nia disabled
  }
}

async function processNiaCheckins(): Promise<void> {
  // Honour the admin Nia kill-switch before doing any work.
  if (!(await isNiaEnabled())) {
    logger.debug("nia-checkin-worker: skipped — Nia is disabled (kill-switch)");
    return;
  }

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
    hub_in_crisis: boolean;
  }[] = [];

  try {
    // LEFT JOIN through the requester's community to their diaspora hub so
    // this worker (like nia-service's general-checkin-worker) can see
    // hub.is_crisis and pass it to /checkin — previously this query had no
    // visibility into the diaspora-hub crisis flag at all.
    const rows = await db.execute(sql`
      SELECT
        r.id,
        r.title,
        r.category,
        r.requester_id,
        r.helper_id,
        u_req.name  AS requester_name,
        u_hlp.name  AS helper_name,
        COALESCE(dh.is_crisis, FALSE) AS hub_in_crisis
      FROM help_requests r
      JOIN users u_req ON u_req.id = r.requester_id
      LEFT JOIN users u_hlp ON u_hlp.id = r.helper_id
      LEFT JOIN diaspora_hubs dh ON dh.community_id = u_req.community_id AND dh.is_crisis = TRUE
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
      // Coordinate with the nia-service worker so only one worker can
      // generate/persist a check-in for this request at a time.
      const lockResult = await db.execute(sql`
        SELECT pg_try_advisory_lock(hashtext('nia-checkin:' || ${req.id}::text)) AS locked
      `);
      if (!(lockResult.rows[0] as { locked?: boolean })?.locked) {
        logger.info({ requestId: req.id }, "nia-checkin: another worker owns request, skipping");
        continue;
      }

      try {
        // Re-check after acquiring the lock because the due-list query can be stale.
        const state = await db.execute(sql`
          SELECT nia_checkin_sent_at FROM help_requests WHERE id = ${req.id} LIMIT 1
        `);
        if ((state.rows[0] as { nia_checkin_sent_at?: unknown } | undefined)?.nia_checkin_sent_at) {
          logger.info({ requestId: req.id }, "nia-checkin: already processed, skipping");
          continue;
        }

        // Generate a stable session ID shared with the fallback worker.
        const sessionId = `nia_checkin_${req.id}`;
        const niaPayload = {
          userId: req.requester_id,
          requestId: req.id,
          requestTitle: req.title,
          category: req.category,
          helperName: req.helper_name ?? null,
          sessionId,
          hubInCrisis: req.hub_in_crisis,
        };

        const response = await requestNia("/checkin", {
          method: "POST",
          body: JSON.stringify(niaPayload),
        });
        const responseBody = await response.text();
        if (!response.ok) {
          throw new Error(`Nia check-in returned ${response.status}: ${responseBody.slice(0, 200)}`);
        }

        // Only mark sent after Nia has successfully generated and persisted.
        const mark = await db.execute(sql`
          UPDATE help_requests
          SET nia_checkin_sent_at = NOW()
          WHERE id = ${req.id} AND nia_checkin_sent_at IS NULL
        `);
        if ((mark.rowCount ?? 0) === 0) {
          logger.info({ requestId: req.id }, "nia-checkin: completion lost race");
          continue;
        }

        // 4. Send a push notification so the user knows Nia reached out
        // notifType: "nia_checkin" — this type is never gated by user preferences
        // (always sends) so users always receive Nia's follow-up regardless of
        // their notif_nearby_requests or other preference toggles.
        await sendPushToUser(req.requester_id, {
        title: "💙 Nia checked in on you",
        body: `How did ${req.title} go? Tap to chat with Nia.`,
        urgency: "normal",
        requestId: req.id,
        notifType: "nia_checkin" as const,
        }).catch((err) =>
        logger.warn({ err, userId: req.requester_id }, "nia-checkin: push failed")
        );

        logger.info(
        { requestId: req.id, userId: req.requester_id },
        "nia-checkin: sent"
        );
      } finally {
        await db.execute(sql`
          SELECT pg_advisory_unlock(hashtext('nia-checkin:' || ${req.id}::text))
        `).catch((err) =>
          logger.warn({ err, requestId: req.id }, "nia-checkin: advisory unlock failed")
        );
      }
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

