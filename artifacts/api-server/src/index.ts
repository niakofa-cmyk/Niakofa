import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer, stopHeartbeat } from "./lib/ws-hub";
import { startScheduledPaymentReminder, startRecurringRequestWorker, startTrustScoreDecayWorker } from "./lib/scheduler";
import { isRedisConfigured, closeRedis } from "./lib/queue";
import { startPayoutWorker } from "./workers/payout-worker";
import { startPledgeWorker } from "./workers/pledge-worker";
import { startCleanupWorker } from "./workers/cleanup-worker";
import { startNotificationWorker } from "./workers/notification-worker";
import { startAnomalyDetectionWorker } from "./workers/anomaly-worker";
import { startNiaCheckinWorker } from "./workers/nia-checkin-worker";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = http.createServer(app);
initWebSocketServer(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");

  // ── Redis production guard ─────────────────────────────────────────────────
  // Redis is required in production for reliable push notifications, payout
  // retries, and pledge reconciliation. The setInterval fallback is only
  // permitted in development so local dev stays frictionless.
  if (process.env["NODE_ENV"] === "production" && !isRedisConfigured()) {
    logger.error(
      "FATAL: REDIS_URL is required in production. " +
      "BullMQ workers handle push notifications, payout retries, and pledge reconciliation. " +
      "Set REDIS_URL in your environment variables. " +
      "The server will continue but background jobs will NOT run — this is unsafe for production."
    );
  }

  // ── Background workers ────────────────────────────────────────────────────
  if (isRedisConfigured()) {
    // BullMQ workers handle everything — pledge reconciliation is a superset
    // of the legacy setInterval scheduler, so we only run one or the other.
    logger.info("redis: configured — starting BullMQ workers");
    startPayoutWorker();
    startNotificationWorker();
    await startPledgeWorker().catch((err: unknown) =>
      logger.error({ err }, "pledge-worker: failed to start")
    );
    await startCleanupWorker().catch((err: unknown) =>
      logger.error({ err }, "cleanup-worker: failed to start")
    );
    logger.info("bullmq: all workers started");
  } else {
    // No Redis — fall back to simple setInterval-based scheduler.
    // When Redis is added, this branch is skipped automatically (no duplicate reminders).
    logger.warn(
      "redis: REDIS_URL not set — BullMQ workers disabled. " +
      "Falling back to legacy scheduler for payment reminders."
    );
    startScheduledPaymentReminder();
  }

  // Recurring requests worker — fires subscriptions that are due; runs every hour regardless of Redis
  startRecurringRequestWorker();

  // Anomaly detection — runs regardless of Redis; lightweight DB polling
  startAnomalyDetectionWorker();

  // BUG-018: Weekly trust score recency decay — recomputes trust_score for all
  // rated users so old ratings naturally decay even without a new rating event.
  startTrustScoreDecayWorker();

  // Dead-code fix: Nia 24-hour check-in worker — was exported but never called.
  // Now wired: finds completed requests from 23–25h ago and sends Nia follow-ups.
  startNiaCheckinWorker();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutdown: received — closing gracefully");
  stopHeartbeat();
  server.close(async () => {
    await closeRedis();
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
