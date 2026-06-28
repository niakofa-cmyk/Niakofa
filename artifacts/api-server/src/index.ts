import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer, stopHeartbeat } from "./lib/ws-hub";
import { startScheduledPaymentReminder } from "./lib/scheduler";
import { isRedisConfigured, closeRedis } from "./lib/queue";
import { startPayoutWorker } from "./workers/payout-worker";
import { startPledgeWorker } from "./workers/pledge-worker";
import { startCleanupWorker } from "./workers/cleanup-worker";
import { startNotificationWorker } from "./workers/notification-worker";
import { startAnomalyDetectionWorker } from "./workers/anomaly-worker";
import { startNiaCheckinWorker } from "./workers/nia-checkin-worker";
import { startNiaPushQueueWorker } from "./workers/nia-push-queue-worker";
import { processRecurringRequests } from "./routes/recurring";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = http.createServer(app);
initWebSocketServer(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");

  if (process.env["NODE_ENV"] === "production" && !isRedisConfigured()) {
    logger.error(
      "FATAL: REDIS_URL is required in production. " +
      "BullMQ workers handle push notifications, payout retries, and pledge reconciliation. " +
      "Set REDIS_URL in your environment variables. " +
      "The server will continue but background jobs will NOT run — this is unsafe for production."
    );
  }

  if (isRedisConfigured()) {
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
    logger.warn(
      "redis: REDIS_URL not set — BullMQ workers disabled. " +
      "Falling back to legacy scheduler for payment reminders."
    );
    startScheduledPaymentReminder();
  }

  // Anomaly detection runs regardless of Redis
  startAnomalyDetectionWorker();
  // 24h check-in worker — Nia follows up after every completed request
  startNiaCheckinWorker();
  // Nia push queue consumer — drains push_notification_queue written by nia-service
  // ambient-presence and general-checkin workers; delivers via sendPushToUser every 5 min
  startNiaPushQueueWorker();
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
