/**
 * Worker Registry — tracks the running state of every background worker.
 *
 * Why this exists:
 * pledge-worker, payout-worker, cashout-worker all gate startup on Redis being
 * configured. If Redis silently drops, those workers never start — but the app
 * looks healthy from the outside. This registry gives admins a surface to see
 * exactly which workers are running so they can act before money-movement jobs
 * silently stop.
 *
 * Enhancement: workerRan() tracks last execution time and success/failure
 * counts so the admin dashboard can surface "Pledge Sweeper — last ran 3h ago,
 * 12 successful, 0 failures" instead of just "running".
 *
 * Usage (in index.ts):
 *   import { workerStarted, workerFailed, workerNoRedis } from "./lib/worker-registry";
 *   workerStarted("pledge-worker");
 *   // or:
 *   workerNoRedis("payout-worker");
 *
 * Usage inside worker run functions:
 *   import { workerRan } from "./lib/worker-registry";
 *   workerRan("pledge-worker", true);   // success
 *   workerRan("pledge-worker", false);  // failure
 *
 * GET /api/admin/worker-health exposes this data to the admin panel.
 */

export type WorkerStatus =
  | "running"     // started successfully and has not crashed
  | "stopped"     // registered but not yet started (boot race or conditional)
  | "no_redis"    // Redis is not configured; this worker requires it
  | "error";      // threw an unrecoverable error at startup

export interface WorkerEntry {
  name: string;
  label: string;              // human-readable
  status: WorkerStatus;
  redisRequired: boolean;
  startedAt?: string;         // ISO timestamp when the worker process started
  lastRunAt?: string;         // ISO timestamp of most recent execution (success or failure)
  lastSuccessAt?: string;     // ISO timestamp of most recent successful run
  lastFailureAt?: string;     // ISO timestamp of most recent failed run
  successCount: number;       // total successful runs this process lifetime
  failureCount: number;       // total failed runs this process lifetime
  errorMessage?: string;
}

const registry = new Map<string, WorkerEntry>();

function ensureEntry(name: string, label: string, redisRequired: boolean): WorkerEntry {
  if (!registry.has(name)) {
    registry.set(name, {
      name,
      label,
      status: "stopped",
      redisRequired,
      successCount: 0,
      failureCount: 0,
    });
  }
  return registry.get(name)!;
}

/** Call once per worker, at registration time (before Redis check). */
export function registerWorker(name: string, label: string, redisRequired: boolean) {
  ensureEntry(name, label, redisRequired);
}

/** Call when the worker has successfully started. */
export function workerStarted(name: string, label = name, redisRequired = true) {
  const entry = ensureEntry(name, label, redisRequired);
  registry.set(name, {
    ...entry,
    status: "running",
    startedAt: new Date().toISOString(),
    errorMessage: undefined,
  });
}

/** Call when a worker could not start because Redis is absent. */
export function workerNoRedis(name: string, label = name) {
  const entry = ensureEntry(name, label, true);
  registry.set(name, { ...entry, status: "no_redis", startedAt: undefined });
}

/** Call when a worker threw at startup or crashed. */
export function workerFailed(name: string, label = name, error: unknown) {
  const entry = ensureEntry(name, label, false);
  const msg = error instanceof Error ? error.message : String(error);
  registry.set(name, { ...entry, status: "error", errorMessage: msg, startedAt: undefined });
}

/**
 * Call each time a worker completes a scheduled run (success OR failure).
 * This surfaces "last ran X minutes ago" and run counts in the admin dashboard,
 * closing the gap where a worker shows "running" but hasn't actually executed
 * in hours because its setInterval silently stalled.
 *
 * @param name   - Must match the name passed to registerWorker / workerStarted.
 * @param success - true if the run completed without error, false otherwise.
 */
export function workerRan(name: string, success: boolean) {
  const entry = registry.get(name);
  if (!entry) return; // safety: unknown worker name — silently skip

  const now = new Date().toISOString();
  registry.set(name, {
    ...entry,
    lastRunAt: now,
    lastSuccessAt: success ? now : entry.lastSuccessAt,
    lastFailureAt: success ? entry.lastFailureAt : now,
    successCount: success ? entry.successCount + 1 : entry.successCount,
    failureCount: success ? entry.failureCount : entry.failureCount + 1,
  });
}

/** Returns the full registry as a sorted array for the health endpoint. */
export function getWorkerHealth(): WorkerEntry[] {
  return Array.from(registry.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Returns true iff every redis-required worker is running (for overall status). */
export function areAllCriticalWorkersRunning(): boolean {
  for (const entry of registry.values()) {
    if (entry.redisRequired && entry.status !== "running" && entry.status !== "stopped") {
      return false;
    }
    if (entry.status === "error") return false;
  }
  return true;
}
