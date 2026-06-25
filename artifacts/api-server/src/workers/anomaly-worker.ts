import { db, usersTable, requestsTable, ratingsTable } from "@workspace/db";
import { sql, and, gte, eq, lte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { broadcastToAdmins } from "../lib/ws-hub";

const INTERVAL_MS = 10 * 60 * 1000;
// BUG-4-M09: Thresholds are now configurable via env vars so fraud tuning
// doesn't require a code deploy. Defaults preserve the original behaviour.
const CANCEL_THRESHOLD = parseInt(process.env["ANOMALY_CANCEL_THRESHOLD"] ?? "3", 10);
const LOW_TRUST_THRESHOLD = parseFloat(process.env["ANOMALY_LOW_TRUST_THRESHOLD"] ?? "2.0");
const WINDOW_HOURS = parseInt(process.env["ANOMALY_WINDOW_HOURS"] ?? "24", 10);
/** Flag helpers who receive this many 1-star ratings within the window */
const RATING_VELOCITY_THRESHOLD = parseInt(process.env["ANOMALY_RATING_VELOCITY_THRESHOLD"] ?? "3", 10);

// LOW-009: track the last time each low-trust helper was alerted so admins
// aren't re-notified every cycle for the same standing condition.
const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
const lastAlertedAt = new Map<number, number>();

async function detectAnomalies() {
  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

    // BUG-013: The previous query looked for status='cancelled' AND helper_id IS NOT NULL,
    // then labeled those as "helper cancellations." This was wrong: status='cancelled' is
    // set ONLY when the REQUESTER cancels — not the helper. Helper release sets status
    // back to 'open'. The old query was flagging helpers for something the requester did.
    //
    // Correct approach: detect requesters who repeatedly cancel AFTER a helper was
    // assigned (cancelled_at IS NOT NULL with the helper_id column still populated at
    // cancel time). This is a legitimate signal — a requester doing this repeatedly may
    // be gaming the system. The alert label now correctly identifies the requester.
    //
    // True helper abandonment detection requires a dedicated schema column (cancelled_by
    // or a request_events log). That is tracked as a future schema migration.
    const frequentRequesterCancels = await db
      .select({
        requester_id: requestsTable.requester_id,
        cancel_count: sql<number>`cast(count(*) as int)`,
      })
      .from(requestsTable)
      .where(
        and(
          eq(requestsTable.status, "cancelled"),
          gte(requestsTable.cancelled_at, since),
          sql`${requestsTable.helper_id} IS NOT NULL`
        )
      )
      .groupBy(requestsTable.requester_id)
      .having(sql`count(*) >= ${CANCEL_THRESHOLD}`);

    for (const row of frequentRequesterCancels) {
      logger.warn(
        { requester_id: row.requester_id, cancel_count: row.cancel_count, window_hours: WINDOW_HOURS },
        "anomaly: requester repeatedly cancelled claimed requests — flagged for admin review"
      );
      broadcastToAdmins({
        type: "anomaly_detected",
        payload: {
          kind: "frequent_requester_cancels",
          requester_id: row.requester_id,
          cancel_count: row.cancel_count,
          window_hours: WINDOW_HOURS,
          note: "Requester cancelled after helper was assigned — possible bad-faith behavior",
        },
      });
    }

    const lowTrustActiveHelpers = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        trust_score: usersTable.trust_score,
        help_count: usersTable.help_count,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.is_helper, true),
          eq(usersTable.helper_mode_active, true),
          sql`${usersTable.trust_score} < ${LOW_TRUST_THRESHOLD}`
        )
      );

    for (const user of lowTrustActiveHelpers) {
      const lastAlert = lastAlertedAt.get(user.id);
      if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) continue;
      lastAlertedAt.set(user.id, Date.now());

      logger.warn(
        { user_id: user.id, trust_score: user.trust_score, help_count: user.help_count },
        "anomaly: active helper with critically low trust score"
      );

      // BUG-4-H04: Downstream action — automatically disable helper mode for
      // critically low-trust active helpers. Previously the flag was written but
      // never acted on, leaving dangerous helpers able to claim requests.
      // Admins are still notified via WebSocket for manual review.
      try {
        await db.update(usersTable)
          .set({ helper_mode_active: false })
          .where(eq(usersTable.id, user.id));
        logger.warn(
          { user_id: user.id },
          "anomaly: disabled helper_mode_active for critically low-trust helper — admin review required"
        );
      } catch (err) {
        logger.error({ err, user_id: user.id }, "anomaly: failed to disable helper mode for low-trust helper");
      }

      broadcastToAdmins({
        type: "anomaly_detected",
        payload: {
          kind: "low_trust_active_helper",
          user_id: user.id,
          name: user.name,
          trust_score: user.trust_score,
          help_count: user.help_count,
          action_taken: "helper_mode_disabled",
        },
      });
    }

    // ── Rating velocity — 3+ one-star ratings in 24h ─────────────────────────
    // A burst of 1-star ratings in a short window is a strong signal of
    // bad-faith behaviour or a serious service failure. Surfaces it for
    // immediate admin review before the helper's trust score decays naturally.
    let ratingVelocityRows: { ratee_id: number; count: number }[] = [];
    try {
      ratingVelocityRows = await db
        .select({
          ratee_id: ratingsTable.ratee_id,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(ratingsTable)
        .where(
          and(
            eq(ratingsTable.stars, 1),
            gte(ratingsTable.created_at, since)
          )
        )
        .groupBy(ratingsTable.ratee_id)
        .having(sql`count(*) >= ${RATING_VELOCITY_THRESHOLD}`);
    } catch {
      // ratings table may not exist in dev — silent skip
    }

    for (const row of ratingVelocityRows) {
      const lastAlert = lastAlertedAt.get(row.ratee_id + 100_000); // offset to avoid key collision with low-trust map
      if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) continue;
      lastAlertedAt.set(row.ratee_id + 100_000, Date.now());

      logger.warn(
        { user_id: row.ratee_id, one_star_count: row.count, window_hours: WINDOW_HOURS },
        "anomaly: helper received multiple 1-star ratings in 24h — flagged for immediate review"
      );
      broadcastToAdmins({
        type: "anomaly_detected",
        payload: {
          kind: "rating_velocity_spike",
          user_id: row.ratee_id,
          one_star_count: row.count,
          window_hours: WINDOW_HOURS,
          note: "Rapid 1-star rating burst — possible bad-faith experience or service failure",
          severity: "high",
        },
      });
    }

    // ── No-show pattern — claimed but stalled requests ────────────────────────
    // Helpers who claim a request and never move to en_route within 30 minutes
    // are a drag on the requester experience. Flag for follow-up.
    // We detect this by looking for requests in 'claimed' status for > 30 min.
    let stalledRows: { id: number; helper_id: number | null; requester_id: number; title: string }[] = [];
    try {
      stalledRows = await db
        .select({
          id: requestsTable.id,
          helper_id: requestsTable.helper_id,
          requester_id: requestsTable.requester_id,
          title: requestsTable.title,
        })
        .from(requestsTable)
        .where(
          and(
            eq(requestsTable.status, "claimed"),
            lte(requestsTable.claimed_at, new Date(Date.now() - 30 * 60 * 1000)),
            sql`${requestsTable.helper_id} IS NOT NULL`
          )
        );
    } catch {
      // claimed_at column may not exist in older DB — silent skip
    }

    for (const row of stalledRows) {
      if (!row.helper_id) continue;
      const mapKey = row.id + 200_000;
      const lastAlert = lastAlertedAt.get(mapKey);
      if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) continue;
      lastAlertedAt.set(mapKey, Date.now());

      logger.warn(
        { request_id: row.id, helper_id: row.helper_id },
        "anomaly: claimed request stalled — helper has not moved to en_route in 30+ minutes"
      );
      broadcastToAdmins({
        type: "anomaly_detected",
        payload: {
          kind: "no_show_stall",
          request_id: row.id,
          helper_id: row.helper_id,
          requester_id: row.requester_id,
          request_title: row.title,
          note: "Helper claimed but has not moved to en_route in 30+ minutes",
          severity: "medium",
        },
      });
    }

    const totalFlagged =
      frequentRequesterCancels.length +
      lowTrustActiveHelpers.length +
      ratingVelocityRows.length +
      stalledRows.filter((r) => r.helper_id).length;

    if (totalFlagged > 0) {
      logger.info(
        {
          frequent_cancellers: frequentRequesterCancels.length,
          low_trust: lowTrustActiveHelpers.length,
          rating_spikes: ratingVelocityRows.length,
          no_show_stalls: stalledRows.length,
        },
        "anomaly: scan complete — flagged events detected"
      );
    }
  } catch (err) {
    logger.error({ err }, "anomaly: detection worker error");
  }
}

export function startAnomalyDetectionWorker(): NodeJS.Timeout {
  logger.info("anomaly: detection worker started");
  detectAnomalies().catch(() => {});
  return setInterval(() => { detectAnomalies().catch(() => {}); }, INTERVAL_MS);
}
