/**
 * Worker Lifecycle Manager for nia-service
 *
 * Same pattern as api-server's worker-lifecycle but using nia-service's
 * own pino logger (no shared module import — enforces App/AI separation).
 */
import { pino } from "pino";

const logger = pino({ level: "info" });

interface WorkerEntry {
  name: string;
  interval: ReturnType<typeof setInterval>;
  flush?: () => Promise<void>;
}

const registry: WorkerEntry[] = [];
let shuttingDown = false;

export function registerWorker(
  name: string,
  interval: ReturnType<typeof setInterval>,
  flush?: () => Promise<void>,
): void {
  registry.push({ name, interval, flush });
  logger.info({ worker: name }, "nia: worker registered");
}

export async function shutdownWorkers(timeoutMs = 10_000): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ count: registry.length }, "nia: shutting down workers...");

  for (const entry of registry) {
    clearInterval(entry.interval);
    if (entry.flush) {
      try {
        await Promise.race([
          entry.flush(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`flush timeout: ${entry.name}`)), timeoutMs),
          ),
        ]);
      } catch (err) {
        logger.error({ err, worker: entry.name }, "nia: worker flush failed");
      }
    }
    logger.info({ worker: entry.name }, "nia: worker stopped");
  }
  registry.length = 0;
  logger.info("nia: all workers shut down");
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function getActiveWorkers(): string[] {
  return registry.map((w) => w.name);
}
