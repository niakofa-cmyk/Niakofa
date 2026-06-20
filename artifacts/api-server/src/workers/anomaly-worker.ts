import { db, usersTable, requestsTable } from "@workspace/db";
import { sql, and, gte, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const INTERVAL_MS = 10 * 60 * 1000;
const CANCEL_THRESHOLD = 3;
const LOW_TRUST_THRESHOLD = 2.0;
const WINDOW_HOURS = 24;

async function detectAnomalies() {
  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

    const frequentCancellations = await db
      .select({
        helper_id: requestsTable.helper_id,
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
      .groupBy(requestsTable.helper_id)
      .having(sql`count(*) >= ${CANCEL_THRESHOLD}`);

    for (const row of frequentCancellations) {
      if (row.helper_id) {
        logger.warn(
          { helper_id: row.helper_id, cancel_count: row.cancel_count, window_hours: WINDOW_HOURS },
          "anomaly: helper has frequent cancellations — flagged for admin review"
        );
      }
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
      logger.warn(
        { user_id: user.id, trust_score: user.trust_score, help_count: user.help_count },
        "anomaly: active helper with critically low trust score"
      );
    }

    const totalFlagged = frequentCancellations.length + lowTrustActiveHelpers.length;
    if (totalFlagged > 0) {
      logger.info(
        { frequent_cancellers: frequentCancellations.length, low_trust: lowTrustActiveHelpers.length },
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
