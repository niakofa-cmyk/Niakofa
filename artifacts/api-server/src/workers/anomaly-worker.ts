import { db, usersTable, requestsTable, ratingsTable } from "@workspace/db";
import { sql, and, gte, eq, lte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { broadcastToAdmins } from "../lib/ws-hub";
import { getRedisConnection } from "../lib/queue";

const INTERVAL_MS = 10 * 60 * 1000;
// BUG-4-M09: Thresholds are now configurable via env vars so fraud tuning
// doesn't require a code deploy. Defaults preserve the original behaviour.
const CANCEL_THRESHOLD = parseInt(process.env["ANOMALY_CANCEL_THRESHOLD"] ?? "3", 10);
// BUG-5-H07: Default was 2.0 on a 0–100 scale — effectively unreachable except
// for the -1 banned sentinel. Changed to 25 (bottom quarter of the scale).
// Override with ANOMALY_LOW_TRUST_THRESHOLD env var to tune without redeploy.
const LOW_TRUST_THRESHOLD = parseFloat(process.env["ANOMALY_LOW_TRUST_THRESHOLD"] ?? "25.0");
const WINDOW_HOURS = parseInt(process.env["ANOMALY_WINDOW_HOURS"] ?? "24", 10);
/** Flag helpers who receive this many 1-star ratings within the window */
const RATING_VELOCITY_THRESHOLD = parseInt(process.env["ANOMALY_RATING_VELOCITY_THRESHOLD"] ?? "3", 10);

const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
const ALERT_COOLDOWN_SEC = Math.ceil(ALERT_COOLDOWN_MS / 1000);

// ── Persistent alert deduplication ───────────────────────────────────────────
// Uses Redis (with TTL) when available so alert cooldowns survive server
// restarts and work correctly across multiple instances. Falls back to an
// in-memory Map only when Redis is not configured (dev / single-instance).
// The in-memory fallback grows only up to ~1 entry per alerted user/request;
// entries are evicted naturally as cooldowns expire when Redis IS available.
const _memLastAlertedAt = new Map<string, number>();

async function wasAlertedRecently(key: string): Promise<boolean> {
  const redis = getRedisConnection();
  if (redis) {
    try {
      const val = await redis.get(`anomaly:alert:${key}`);
      return val === "1";
    } catch {
      // Redis error — fall through to memory fallback
    }
  }
  const last = _memLastAlertedAt.get(key);
  return last !== undefined && Date.now() - last < ALERT_COOLDOWN_MS;
}

async function recordAlert(key: string): Promise<void> {
  const redis = getRedisConnection();
  if (redis) {
    try {
      await redis.set(`anomaly:alert:${key}`, "1", "EX", ALERT_COOLDOWN_SEC);
      return;
    } catch {
      // Redis error — fall through to memory fallback
    }
  }
  _memLastAlertedAt.set(key, Date.now());
  // Evict expired in-memory entries whenever the map grows large to prevent
  // unbounded growth in long-running single-instance deployments without Redis.
  if (_memLastAlertedAt.size > 500) {
    const cutoff = Date.now() - ALERT_COOLDOWN_MS;
    for (const [k, ts] of _memLastAlertedAt) {
      if (ts < cutoff) _memLastAlertedAt.delete(k);
    }
  }
}

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
      const alertKey = `req-cancel:${row.requester_id}`;
      if (await wasAlertedRecently(alertKey)) continue;
      await recordAlert(alertKey);

      logger.warn(
        { requester_id: row.requester_id, cancel_count: row.cancel_count, window_hours: WINDOW_HOURS },
        "anomaly: requester repeatedly cancelled claimed requests — applying trust penalty"
      );

      // Auto-action: suspend requester account (Phase 13 hard block)
      let cancelActionTaken = "none";
      try {
        await db.update(usersTable)
          .set({
            is_suspended: true,
            suspended_at: new Date(),
            suspended_reason: `Anomaly: ${row.cancel_count} cancellations after helper assigned in ${WINDOW_HOURS}h — auto-suspended`,
          })
          .where(eq(usersTable.id, row.requester_id));
        cancelActionTaken = "suspended";
        logger.warn({ user_id: row.requester_id }, "anomaly: account suspended for repeat bad-faith cancels");
      } catch (err) {
        logger.error({ err, user_id: row.requester_id }, "anomaly: failed to suspend requester");
      }

      broadcastToAdmins({
        type: "anomaly_detected",
        payload: {
          kind: "frequent_requester_cancels",
          requester_id: row.requester_id,
          cancel_count: row.cancel_count,
          window_hours: WINDOW_HOURS,
          action_taken: cancelActionTaken,
          note: "Requester cancelled after helper was assigned — trust score penalized, admin review recommended",
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
      const alertKey = `low-trust:${user.id}`;
      if (await wasAlertedRecently(alertKey)) continue;
      await recordAlert(alertKey);

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
      const alertKey = `rating-velocity:${row.ratee_id}`;
      if (await wasAlertedRecently(alertKey)) continue;
      await recordAlert(alertKey);

      logger.warn(
        { user_id: row.ratee_id, one_star_count: row.count, window_hours: WINDOW_HOURS },
        "anomaly: helper received multiple 1-star ratings in 24h — disabling helper mode"
      );

      // Auto-action: suspend account + disable helper mode (Phase 13)
      let actionTaken = "none";
      try {
        await db.update(usersTable)
          .set({
            is_suspended: true,
            suspended_at: new Date(),
            suspended_reason: `Anomaly: ${row.count} one-star ratings in ${WINDOW_HOURS}h — auto-suspended pending admin review`,
            helper_mode_active: false,
          })
          .where(eq(usersTable.id, row.ratee_id));
        actionTaken = "suspended_and_helper_mode_disabled";
        logger.warn({ user_id: row.ratee_id }, "anomaly: account suspended due to rating velocity spike");
      } catch (err) {
        logger.error({ err, user_id: row.ratee_id }, "anomaly: failed to suspend account on rating spike");
      }

      broadcastToAdmins({
        type: "anomaly_detected",
        payload: {
          kind: "rating_velocity_spike",
          user_id: row.ratee_id,
          one_star_count: row.count,
          window_hours: WINDOW_HOURS,
          action_taken: actionTaken,
          note: "Rapid 1-star rating burst — helper mode disabled pending admin review",
          severity: "high",
        },
      });
    }

    // ── No-show pattern — claimed but stalled requests ────────────────────────
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
      const alertKey = `no-show:${row.id}`;
      if (await wasAlertedRecently(alertKey)) continue;
      await recordAlert(alertKey);

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
