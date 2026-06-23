import { db, usersTable, requestsTable } from "@workspace/db";
import { sql, and, gte, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { broadcastToAdmins } from "../lib/ws-hub";

const INTERVAL_MS = 10 * 60 * 1000;
const CANCEL_THRESHOLD = 3;
const LOW_TRUST_THRESHOLD = 2.0;
const WINDOW_HOURS = 24;

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
      broadcastToAdmins({
        type: "anomaly_detected",
        payload: {
          kind: "low_trust_active_helper",
          user_id: user.id,
          name: user.name,
          trust_score: user.trust_score,
          help_count: user.help_count,
        },
      });
    }

    const totalFlagged = frequentRequesterCancels.length + lowTrustActiveHelpers.length;
    if (totalFlagged > 0) {
      logger.info(
        { frequent_requester_cancellers: frequentRequesterCancels.length, low_trust: lowTrustActiveHelpers.length },
        "anomaly: scan complete — flagged users detected"
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
