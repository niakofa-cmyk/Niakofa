/**
 * Worker Lifecycle Manager
 *
 * Provides a registry for background workers (setInterval-based schedulers)
 * with graceful shutdown support. Workers register their interval handles;
 * on SIGTERM/SIGINT all intervals are cleared and a final flush is awaited.
 *
 * Usage:
 *   import { registerWorker } from "../lib/worker-lifecycle";
 *   const interval = setInterval(() => { ... }, 60_000);
 *   registerWorker("crisis-followup", interval);
 */
import { logger } from "./logger";

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
  logger.info({ worker: name }, "worker registered");
}

export function unregisterWorker(name: string): void {
  const idx = registry.findIndex((w) => w.name === name);
  if (idx >= 0) {
    clearInterval(registry[idx].interval);
    registry.splice(idx, 1);
    logger.info({ worker: name }, "worker unregistered");
  }
}

export async function shutdownWorkers(timeoutMs = 10_000): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ count: registry.length }, "shutting down workers...");

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
        logger.error({ err, worker: entry.name }, "worker flush failed");
      }
    }
    logger.info({ worker: entry.name }, "worker stopped");
  }
  registry.length = 0;
  logger.info("all workers shut down");
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function getActiveWorkers(): string[] {
  return registry.map((w) => w.name);
}
