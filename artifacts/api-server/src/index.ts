import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer, stopHeartbeat } from "./lib/ws-hub";
import { startScheduledPaymentReminder, startPifNudgeWorker, startPledgeDefaultWorker, startCashoutReconciliation } from "./lib/scheduler";
import { isRedisConfigured, getRedisUrlStatus, closeRedis } from "./lib/queue";
import {
  workerStarted,
  workerNoRedis,
  workerFailed,
  registerWorker,
} from "./lib/worker-registry";
import { startPayoutWorker } from "./workers/payout-worker";
import { startCashoutWorker } from "./workers/cashout-worker";
import { startPledgeWorker } from "./workers/pledge-worker";
import { startCleanupWorker } from "./workers/cleanup-worker";
import { startNotificationWorker } from "./workers/notification-worker";
import { startAnomalyDetectionWorker } from "./workers/anomaly-worker";
import { startNiaCheckinWorker } from "./workers/nia-checkin-worker";
import { startNiaPushQueueWorker } from "./workers/nia-push-queue-worker";
import { startPoolMinimumsWorker } from "./workers/pool-minimums-worker";
import { processRecurringRequests } from "./routes/recurring";
const RECURRING_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ── Critical secrets guard ─────────────────────────────────────────────────
// Fail fast at startup rather than serving auth-broken requests.
const SESSION_SECRET = process.env["SESSION_SECRET"];
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error(
    "SESSION_SECRET must be set to a random string of at least 32 characters. " +
    "All authenticated requests will fail without it. Set this in Railway Variables."
  );
}

const server = http.createServer(app);
initWebSocketServer(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");

  // BUG-CRIT-05: `pnpm --filter @workspace/db run migrate` referenced in
  // railway.toml's startCommand silently failed on every deploy — that
  // script never existed in lib/db/package.json (only "push"/"push-force"
  // did). It's been added now, but to not depend on that deploy-time step
  // actually running correctly going forward, this also self-heals at
  // application startup: re-applies the same idempotent backfill from
  // migration 0021 every time the server boots. Safe to run repeatedly —
  // it only touches rows still sitting at the stuck default state, and a
  // no-op WHERE clause costs one cheap query on every other boot.
  try {
    const result = await db.update(usersTable)
      .set({ approval_status: "approved" })
      .where(and(eq(usersTable.account_type, "individual"), eq(usersTable.approval_status, "pending")))
      .returning({ id: usersTable.id });
    if (result.length > 0) {
      logger.info({ count: result.length }, "startup: auto-approved stuck individual accounts (approval_status backfill)");
    }
  } catch (err) {
    logger.error({ err }, "startup: approval_status backfill failed — non-fatal, continuing boot");
  }

  if (process.env["NODE_ENV"] === "production" && !isRedisConfigured()) {
    const redisStatus = getRedisUrlStatus();
    logger.error(
      { redis_url_status: redisStatus },
      redisStatus === "invalid_format"
        ? "FATAL: REDIS_URL is set in production but is NOT a valid redis:// or rediss:// URL — " +
          "it will be silently ignored. BullMQ workers handle push notifications, payout retries, " +
          "and pledge reconciliation. Check the exact value in your production environment (Railway " +
          "dashboard → Variables) — a common cause is an unresolved template placeholder like " +
          "\"${{Redis.REDIS_URL}}\" or a bare hostname. The server will continue but background jobs " +
          "will NOT run — this is unsafe for production."
        : "FATAL: REDIS_URL is required in production. " +
          "BullMQ workers handle push notifications, payout retries, and pledge reconciliation. " +
          "Set REDIS_URL in your environment variables. " +
          "The server will continue but background jobs will NOT run — this is unsafe for production."
    );
  }

  // Register all workers in the health registry before starting them.
  // Any worker that fails to start (or is skipped due to missing Redis) will
  // show as "stopped" / "no_redis" / "error" in GET /api/admin/worker-health.
  registerWorker("payout-worker",       "Payout Worker",          true);
  registerWorker("cashout-worker",      "Cashout Worker",         true);
  registerWorker("notification-worker", "Notification Worker",    true);
  registerWorker("pledge-worker",       "Pledge Reconciliation",  true);
  registerWorker("cleanup-worker",      "Cleanup Worker",         true);
  registerWorker("pif-nudge",           "PIF Nudge Scheduler",    false);
  registerWorker("anomaly-worker",      "Anomaly Detection",      false);
  registerWorker("nia-checkin",         "Nia 24h Check-in",       false);
  registerWorker("nia-push-queue",      "Nia Push Queue",         false);
  registerWorker("pool-minimums",       "Pool Minimums",          false);
  registerWorker("pledge-defaults",     "Pledge Default Sweeper", false);
  registerWorker("cashout-recon",       "Cashout Reconciliation", false);
  registerWorker("recurring-requests",  "Recurring Requests",     false);

  if (isRedisConfigured()) {
    logger.info("redis: configured — starting BullMQ workers");
    startPayoutWorker(); workerStarted("payout-worker", "Payout Worker", true);
    startCashoutWorker(); workerStarted("cashout-worker", "Cashout Worker", true);
    startNotificationWorker(); workerStarted("notification-worker", "Notification Worker", true);
    await startPledgeWorker().then(() => workerStarted("pledge-worker", "Pledge Reconciliation", true)).catch((err: unknown) => {
      logger.error({ err }, "pledge-worker: failed to start");
      workerFailed("pledge-worker", "Pledge Reconciliation", err);
    });
    await startCleanupWorker().then(() => workerStarted("cleanup-worker", "Cleanup Worker", true)).catch((err: unknown) => {
      logger.error({ err }, "cleanup-worker: failed to start");
      workerFailed("cleanup-worker", "Cleanup Worker", err);
    });
    logger.info("bullmq: all workers started");
  } else {
    logger.warn(
      "redis: REDIS_URL not set — BullMQ workers disabled. " +
      "Falling back to legacy scheduler for payment reminders."
    );
    workerNoRedis("payout-worker",       "Payout Worker");
    workerNoRedis("cashout-worker",      "Cashout Worker");
    workerNoRedis("notification-worker", "Notification Worker");
    workerNoRedis("pledge-worker",       "Pledge Reconciliation");
    workerNoRedis("cleanup-worker",      "Cleanup Worker");
    startScheduledPaymentReminder();
  }

  // PIF repayment nudges — runs regardless of Redis (setInterval-based)
  startPifNudgeWorker(); workerStarted("pif-nudge", "PIF Nudge Scheduler", false);
  // Anomaly detection runs regardless of Redis
  startAnomalyDetectionWorker(); workerStarted("anomaly-worker", "Anomaly Detection", false);
  // 24h check-in worker — Nia follows up after every completed request
  startNiaCheckinWorker(); workerStarted("nia-checkin", "Nia 24h Check-in", false);
  // Nia push queue consumer — drains push_notification_queue written by nia-service
  // ambient-presence and general-checkin workers; delivers via sendPushToUser every 5 min
  startNiaPushQueueWorker(); workerStarted("nia-push-queue", "Nia Push Queue", false);
  // Community Pool backfill — retries queued guaranteed minimums + low-balance alert
  startPoolMinimumsWorker(); workerStarted("pool-minimums", "Pool Minimums", false);
  // Pledge default automation — marks 90-day unpaid PIF pledges as defaulted + applies trust hit
  startPledgeDefaultWorker(); workerStarted("pledge-defaults", "Pledge Default Sweeper", false);
  // Cashout reconciliation — refunds stale pending/failed cashouts with no Stripe transfer
  startCashoutReconciliation(); workerStarted("cashout-recon", "Cashout Reconciliation", false);
  // Recurring requests — fire any due recurring requests every hour
  processRecurringRequests().catch((err: unknown) =>
    logger.error({ err }, "recurring-worker: initial run failed — non-fatal")
  );
  setInterval(() => {
    processRecurringRequests().catch((err: unknown) =>
      logger.error({ err }, "recurring-worker: scheduled run failed")
    );
  }, RECURRING_INTERVAL_MS);
  workerStarted("recurring-requests", "Recurring Requests", false);
  logger.info({ intervalMs: RECURRING_INTERVAL_MS }, "recurring-worker: started");
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutdown: received — closing gracefully");
  stopHeartbeat();
  server.close(async () => {
    await closeRedis();
    // Drain the Postgres connection pool cleanly so Railway doesn't accumulate
    // dangling connections across rolling restarts.
    try {
      const { pool } = await import("@workspace/db");
      await pool.end();
      logger.info("shutdown: DB pool drained");
    } catch (err) {
      logger.error({ err }, "shutdown: DB pool drain failed — forcing exit anyway");
    }
    logger.info("shutdown: complete");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("shutdown: timed out — forcing exit");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
