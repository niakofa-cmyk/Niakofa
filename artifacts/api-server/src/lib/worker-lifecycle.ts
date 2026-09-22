/**
 * Process-wide BullMQ worker lifecycle registry.
 *
 * Workers are registered as soon as they are created so SIGTERM/SIGINT can
 * stop fetching new jobs and wait for active jobs to finish before Redis/DB
 * connections are closed. BullMQ documents Worker.close() as the graceful
 * shutdown primitive.
 */
import type { Worker } from "bullmq";
import { logger } from "./logger";

const workers = new Set<Worker>();
let closing = false;

export function trackWorker(worker: Worker | null | undefined): Worker | null | undefined {
  if (!worker) return worker;
  if (closing) {
    void worker.close(true).catch((err) =>
      logger.warn({ err }, "bullmq: worker created during shutdown could not be closed")
    );
    return worker;
  }
  workers.add(worker);
  return worker;
}

export function workerCount(): number {
  return workers.size;
}

export async function closeWorkers(timeoutMs = 30_000): Promise<void> {
  if (closing && workers.size === 0) return;
  closing = true;
  const active = [...workers];
  if (!active.length) return;

  logger.info({ count: active.length }, "bullmq: gracefully closing workers");

  let timedOut = false;
  await Promise.race([
    Promise.all(active.map(async (worker) => {
      try {
        await worker.close();
      } catch (err) {
        logger.error({ err }, "bullmq: worker graceful close failed");
      }
    })),
    new Promise<void>((resolve) => setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs)),
  ]);

  if (timedOut) {
    logger.warn(
      { remaining: workers.size },
      "bullmq: shutdown timeout reached; forcing remaining workers closed",
    );
    await Promise.all([...workers].map((worker) => worker.close(true).catch((err) =>
      logger.warn({ err }, "bullmq: forced worker close failed")
    )));
  }
  workers.clear();
}