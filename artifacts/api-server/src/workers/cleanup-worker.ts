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

// Expiry thresholds by urgency (in milliseconds)
const EXPIRY_MS: Record<string, number> = {
  emergency: 2  * 60 * 60 * 1000,
  high:      6  * 60 * 60 * 1000,
  medium:    24 * 60 * 60 * 1000,
  low:       72 * 60 * 60 * 1000,
};

const ORPHAN_CLAIMED_MS = 4 * 60 * 60 * 1000; // 4 hours stuck in "claimed"

async function runCleanup(_job: Job): Promise<void> {
  const now = new Date();
  logger.info({ at: now.toISOString() }, "cleanup-worker: starting");

  let totalExpired = 0;

  // 1. Expire stale open requests per urgency threshold
  for (const [urgency, expiryMs] of Object.entries(EXPIRY_MS)) {
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

  // 2. Reset orphaned "claimed" requests (stuck > 4 hours with no progress)
  // back to "open" so another helper can pick them up. Was previously setting
  // status: "expired" here, which contradicted this function's own comment
  // and silently dropped the requester instead of recycling the request —
  // a real bug, not the documented intent. Fixed to match the stated design.
  const orphanCutoff = new Date(now.getTime() - ORPHAN_CLAIMED_MS);
  const orphaned = await db
    .update(requestsTable)
    .set({ status: "open", helper_id: null, claimed_at: null })
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
      "cleanup-worker: reset orphaned claimed requests back to open (helper unresponsive > 4h)"
    );
    for (const req of orphaned) {
      // Re-broadcast as "open" so another helper can pick it up
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
