/**
 * Stale Request Cleanup Worker
 *
 * Runs daily via BullMQ repeatable job (or every 15 min via a setInterval
 * fallback when Redis isn't configured — see startCleanupWorkerLegacy below).
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
 *
 * Also sends two requester-facing notifications so a stuck request is never
 * silent:
 *   - A pre-expiry nudge at 50% of the urgency's expiry window ("no one's
 *     claimed this yet"), sent once per request (expiry_nudge_sent_at gate).
 *   - An expiry notification the moment a request actually expires, so the
 *     requester knows to repost or widen their radius instead of just seeing
 *     it silently vanish from the map.
 */
import { Worker, type Job } from "bullmq";
import { db, requestsTable, circleRecordingsTable } from "@workspace/db";
import { eq, and, lt, isNull } from "drizzle-orm";
import { getRedisConnection, QUEUE } from "../lib/queue";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { trackWorker } from "../lib/worker-lifecycle";
import { sendPushToUser } from "../routes/push";
import { deleteExpiredRecording } from "../lib/circleRecordingPolicy";

const CLEANUP_JOB_NAME = "daily-request-cleanup";
const CLEANUP_REPEAT   = { pattern: "0 3 * * *" }; // 3 AM daily (low traffic)
const LEGACY_INTERVAL_MS = 15 * 60 * 1000; // no-Redis fallback cadence

// Expiry thresholds by urgency (in milliseconds)
const EXPIRY_MS: Record<string, number> = {
  emergency: 2  * 60 * 60 * 1000,
  high:      6  * 60 * 60 * 1000,
  medium:    24 * 60 * 60 * 1000,
  low:       72 * 60 * 60 * 1000,
};

const ORPHAN_CLAIMED_MS = 4 * 60 * 60 * 1000; // 4 hours stuck in "claimed"

const URGENCY_LABEL: Record<string, string> = {
  emergency: "emergency",
  high: "urgent",
  medium: "",
  low: "",
};

// ── Pre-expiry nudge: fires once, at 50% of the urgency's expiry window ────
async function sendPreExpiryNudges(now: Date): Promise<number> {
  let nudged = 0;
  for (const [urgency, expiryMs] of Object.entries(EXPIRY_MS)) {
    const halfwayCutoff = new Date(now.getTime() - expiryMs / 2);
    const candidates = await db
      .update(requestsTable)
      .set({ expiry_nudge_sent_at: now })
      .where(
        and(
          eq(requestsTable.status, "open"),
          eq(requestsTable.urgency, urgency),
          lt(requestsTable.created_at, halfwayCutoff),
          isNull(requestsTable.expiry_nudge_sent_at)
        )
      )
      .returning({ id: requestsTable.id, title: requestsTable.title, requester_id: requestsTable.requester_id });

    for (const req of candidates) {
      nudged++;
      const label = URGENCY_LABEL[urgency] ? ` ${URGENCY_LABEL[urgency]}` : "";
      sendPushToUser(req.requester_id, {
        title: "Still looking for a helper",
        body: `No one's claimed "${req.title}" yet. Want to widen your radius or bump the${label} urgency?`,
        notifType: "wallet",
        requestId: req.id,
      }).catch(err =>
        logger.warn({ err, requestId: req.id }, "cleanup-worker: expiry nudge push failed")
      );
    }
  }
  if (nudged > 0) logger.info({ nudged }, "cleanup-worker: sent pre-expiry nudges");
  return nudged;
}

async function runCleanupCore(): Promise<void> {
  const now = new Date();
  logger.info({ at: now.toISOString() }, "cleanup-worker: starting");

  let totalExpired = 0;

  // Delete expired Circle recording objects before their metadata. A failed
  // object deletion leaves the row in place so the next run can retry safely.
  const expiredRecordings = await db
    .select({
      id: circleRecordingsTable.id,
      storage_key: circleRecordingsTable.storage_key,
    })
    .from(circleRecordingsTable)
    .where(lt(circleRecordingsTable.retention_until, now))
    .limit(100);
  let recordingsDeleted = 0;
  for (const recording of expiredRecordings) {
    try {
      await deleteExpiredRecording(recording);
      recordingsDeleted++;
    } catch (err) {
      logger.error({ err, recordingId: recording.id }, "cleanup-worker: expired Circle recording deletion failed — will retry");
    }
  }
  if (recordingsDeleted > 0) {
    logger.info({ recordingsDeleted }, "cleanup-worker: deleted expired Circle recordings");
  }

  // 0. Nudge requesters whose open request is halfway to expiring with no claim
  await sendPreExpiryNudges(now).catch(err =>
    logger.error({ err }, "cleanup-worker: pre-expiry nudge pass failed — continuing")
  );

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
      .returning({ id: requestsTable.id, title: requestsTable.title, requester_id: requestsTable.requester_id });

    if (expired.length > 0) {
      totalExpired += expired.length;
      logger.info(
        { urgency, count: expired.length, cutoff: cutoff.toISOString() },
        "cleanup-worker: expired open requests"
      );

      // Broadcast each expiry so the frontend map removes them, and let the
      // requester know directly — an expired request otherwise just silently
      // disappears with no explanation.
      for (const req of expired) {
        broadcast({
          type: "request_updated",
          payload: { id: req.id, status: "expired", title: req.title },
        });
        sendPushToUser(req.requester_id, {
          title: "Request expired",
          body: `"${req.title}" expired with no helper claiming it. You can repost it anytime.`,
          notifType: "wallet",
          requestId: req.id,
        }).catch(err =>
          logger.warn({ err, requestId: req.id }, "cleanup-worker: expiry push failed")
        );
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

async function runCleanup(_job: Job): Promise<void> {
  return runCleanupCore();
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
  trackWorker(worker);
  return worker;
}

/**
 * No-Redis fallback. Without this, request expiry (and its nudge/notification
 * side effects) silently never ran at all in any environment without Redis
 * configured — the BullMQ-only path above was the ONLY way this worker fired.
 * Runs immediately, then every 15 minutes — frequent enough that the daily-job
 * 3 AM cadence isn't missed for environments that never get Redis.
 */
export function startCleanupWorkerLegacy(): () => void {
  runCleanupCore().catch(err => logger.error({ err }, "cleanup-worker (legacy): initial run failed"));
  const interval = setInterval(() => {
    runCleanupCore().catch(err => logger.error({ err }, "cleanup-worker (legacy): scheduled run failed"));
  }, LEGACY_INTERVAL_MS);
  logger.info({ intervalMs: LEGACY_INTERVAL_MS }, "cleanup-worker (legacy): started");
  return () => clearInterval(interval);
}
