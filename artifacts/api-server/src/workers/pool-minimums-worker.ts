import { processPendingMinimums, maybeAlertLowBalance } from "../lib/community-pool";
import { logger } from "../lib/logger";

/**
 * Pool minimums backfill worker.
 *
 * Safety net for the event-driven backfill (which runs after every pool
 * contribution/repayment): every 10 minutes, retry any queued guaranteed
 * minimums the pool couldn't cover, and re-check the low-balance alert.
 */
const INTERVAL_MS = 10 * 60 * 1000;

export function startPoolMinimumsWorker(): void {
  const tick = async () => {
    try {
      const paid = await processPendingMinimums();
      if (paid > 0) {
        logger.info({ paid }, "pool-minimums-worker: backfilled queued guaranteed minimums");
      }
      await maybeAlertLowBalance();
    } catch (err) {
      logger.error({ err }, "pool-minimums-worker: tick failed");
    }
  };

  setInterval(tick, INTERVAL_MS).unref();
  // First pass shortly after boot (let the server settle first)
  setTimeout(tick, 15_000).unref();
  logger.info({ intervalMs: INTERVAL_MS }, "pool-minimums-worker: started");
}
