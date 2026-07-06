/**
 * Nia Push Queue Consumer
 *
 * Drains the push_notification_queue table written by nia-service workers
 * (ambient-presence-worker, general-checkin-worker) and delivers each row
 * via the api-server's sendPushToUser function.
 *
 * Why this lives in api-server:
 *   - nia-service has no access to VAPID keys or webpush — that's api-server's domain
 *   - nia-service workers write to push_notification_queue as a lightweight hand-off
 *   - This worker (api-server side) reads and delivers, then marks rows sent
 *   - Clean service boundary: nia-service enqueues, api-server delivers
 *
 * Runs every 5 minutes. Processes up to 100 unsent rows per cycle.
 * Marks rows sent_at = NOW() as soon as delivery is attempted (non-retriable —
 * Nia's proactive messages are best-effort and time-sensitive; a 10-minute-old
 * "just checking in" push is fine, a retried one from 24h later is not).
 *
 * Uses pool.query() directly because push_notification_queue is a nia-service
 * raw pg table, not in the Drizzle schema.
 */
import { pool } from "@workspace/db";
import { sendPushToUser } from "../routes/push";
import { logger } from "../lib/logger";
import { sendNiaEventToUser } from "../lib/ws-hub";

const BATCH_SIZE = 100;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface QueueRow {
  id: number;
  user_id: number;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

async function drainPushQueue(): Promise<void> {
  let rows: QueueRow[];

  try {
    // Atomic claim: UPDATE...RETURNING with FOR UPDATE SKIP LOCKED so concurrent
    // worker instances each claim disjoint batches — prevents duplicate delivery.
    // A plain SELECT + UPDATE in two round-trips creates a TOCTOU race where two
    // instances select the same rows before either marks them sent.
    const result = await pool.query<QueueRow>(
      `UPDATE push_notification_queue
       SET sent_at = NOW()
       WHERE id IN (
         SELECT id
         FROM push_notification_queue
         WHERE sent_at IS NULL
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, user_id, title, body, data`,
      [BATCH_SIZE]
    );
    rows = result.rows;
  } catch (err) {
    // Table may not exist on early boot (nia-service hasn't run migrations yet).
    // Once runMigrations() is called in nia-service/src/index.ts the table exists.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) {
      logger.debug("nia-push-queue-worker: push_notification_queue not yet created — skipping");
      return;
    }
    logger.error({ err }, "nia-push-queue-worker: failed to claim queue batch");
    return;
  }

  if (rows.length === 0) return;

  logger.info({ count: rows.length }, "nia-push-queue-worker: draining batch");

  // Deliver each notification
  let delivered = 0;
  let failed = 0;

  await Promise.allSettled(
    rows.map(async row => {
      try {
        // Determine notifType from data.type or data.notifType field for preference gating
        const rawType = (row.data?.type as string | undefined) ?? "";
        const rawNotifType = (row.data?.notifType as string | undefined) ?? "";
        const notifType = rawNotifType.startsWith("nia_")
          ? "nia_checkin"
          : rawType.startsWith("nia_")
          ? "nia_checkin"
          : undefined;

        await sendPushToUser(row.user_id, {
          title: row.title,
          body: row.body,
          urgency: "normal",
          notifType,
        });
        
        // Emit WebSocket event for real-time NIA notification delivery
        const niaEventType = rawType === "nia_checkin" || rawNotifType === "nia_checkin" 
          ? "nia_checkin" 
          : rawType === "nia_crisis_alert" || rawNotifType === "nia_crisis_alert"
          ? "nia_crisis_alert"
          : "nia_message";
        sendNiaEventToUser(row.user_id, niaEventType, { 
          title: row.title, 
          body: row.body, 
          data: row.data,
          delivered: true 
        });
        
        delivered++;
      } catch (err) {
        logger.warn({ err, userId: row.user_id, rowId: row.id }, "nia-push-queue-worker: delivery failed");
        failed++;
      }
    })
  );

  logger.info({ delivered, failed }, "nia-push-queue-worker: batch complete");
}

export function startNiaPushQueueWorker(): void {
  logger.info("nia-push-queue-worker: starting (5-minute interval)");

  // Run after a short startup delay so other workers initialize first
  setTimeout(async () => {
    try { await drainPushQueue(); }
    catch (err) { logger.error({ err }, "nia-push-queue-worker: startup drain failed"); }

    setInterval(async () => {
      try { await drainPushQueue(); }
      catch (err) { logger.error({ err }, "nia-push-queue-worker: interval drain failed"); }
    }, INTERVAL_MS);
  }, 30_000); // 30s startup delay
}
