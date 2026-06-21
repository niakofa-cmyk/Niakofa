/**
 * Stale Request Cleanup Worker
 *
 * Runs daily via BullMQ repeatable job.
 * Finds open requests that have been sitting unclaimed for too long
 * and marks them as "expired" so they don't pollute the live map.
 *
 * Expiry rules:
 *   emergency urgency — expires after 2 hours
 *   high urgency      — expires after 6 hours
 *   medium urgency    — expires after 24 hours
 *   low urgency       — expires after 72 hours
 *
 * Also cleans up orphaned records (claimed requests where helper_id is set
 * but the request has been in "claimed" state for > 4 hours without progressing).
 */
import { Worker, type Job } from "bullmq";
import { db, requestsTable } from "@workspace/db";
import { eq, and, lt, inArray, sql } from "drizzle-orm";
import { getRedisConnection, QUEUE } from "../lib/queue";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";

const CLEANUP_JOB_NAME = "daily-request-cleanup";
const CLEANUP_REPEAT   = { pattern: "0 3 * * *" }; // 3 AM daily (low traffic)

// Expiry thresholds by urgency (in milliseconds). Kept as a typed array
// rather than Object.entries(Record<string, number>) — Object.entries always
// widens keys back to plain `string`, which no longer satisfies the strict
// urgency enum type after the help_request_urgency migration.
const EXPIRY_THRESHOLDS: Array<{ urgency: "emergency" | "high" | "medium" | "low"; ms: number }> = [
  { urgency: "emergency", ms: 2  * 60 * 60 * 1000 },
  { urgency: "high",      ms: 6  * 60 * 60 * 1000 },
  { urgency: "medium",    ms: 24 * 60 * 60 * 1000 },
  { urgency: "low",       ms: 72 * 60 * 60 * 1000 },
];

const ORPHAN_CLAIMED_MS = 4 * 60 * 60 * 1000; // 4 hours stuck in "claimed"

async function runCleanup(_job: Job): Promise<void> {
  const now = new Date();
  logger.info({ at: now.toISOString() }, "cleanup-worker: starting");

  let totalExpired = 0;

  // 1. Expire stale open requests per urgency threshold
  for (const { urgency, ms: expiryMs } of EXPIRY_THRESHOLDS) {
    const cutoff = new Date(now.getTime() - expiryMs);
    const expired = await db
      .update(requestsTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(requestsTable.status, "open"),
          eq(requestsTable.urgency, urgency),
          lt(requestsTable.created_at, cutoff)
        )
      )
      .returning({ id: requestsTable.id, title: requestsTable.title });

    if (expired.length > 0) {
      totalExpired += expired.length;
      logger.info(
        { urgency, count: expired.length, cutoff: cutoff.toISOString() },
        "cleanup-worker: expired open requests"
      );

      // Broadcast each expiry so the frontend map removes them
      for (const req of expired) {
        broadcast({
          type: "request_updated",
          payload: { id: req.id, status: "expired", title: req.title },
        });
      }
    }
  }

  // 2. Release orphaned "claimed" requests back to the open pool (stuck
  // > 4 hours with no progress) — the helper presumably went unresponsive
  // or abandoned it. Reset to "open" with no helper_id so it can actually
  // be re-claimed by someone else, rather than terminating it outright.
  const orphanCutoff = new Date(now.getTime() - ORPHAN_CLAIMED_MS);
  const orphaned = await db
    .update(requestsTable)
    .set({ status: "open", helper_id: null, claimed_at: null, en_route_at: null, arrived_at: null })
    .where(
      and(
        eq(requestsTable.status, "claimed"),
        lt(requestsTable.claimed_at, orphanCutoff)
      )
    )
    .returning({ id: requestsTable.id });

  if (orphaned.length > 0) {
    totalExpired += orphaned.length;
    logger.warn(
      { count: orphaned.length },
      "cleanup-worker: released orphaned claimed requests back to open"
    );
    for (const req of orphaned) {
      broadcast({
        type: "request_updated",
        payload: { id: req.id, status: "open" },
      });
    }
  }

  logger.info({ totalExpired }, "cleanup-worker: complete");
}

export async function startCleanupWorker(): Promise<Worker | null> {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("cleanup-worker: Redis not configured — worker will not start");
    return null;
  }

  const { cleanupQueue } = await import("../lib/queue");
  if (cleanupQueue) {
    await cleanupQueue.add(CLEANUP_JOB_NAME, {}, {
      repeat: CLEANUP_REPEAT,
      jobId:  CLEANUP_JOB_NAME,
    });
    logger.info("cleanup-worker: daily job scheduled (3 AM)");
  }

  const worker = new Worker(QUEUE.REQUEST_CLEANUP, runCleanup, {
    connection: conn,
    concurrency: 1,
  });

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "cleanup-worker: job done")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "cleanup-worker: job failed")
  );

  logger.info("cleanup-worker: started");
  return worker;
}
