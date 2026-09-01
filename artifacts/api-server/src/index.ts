import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSecretKey, getStripeWebhookSecret } from "./lib/stripe-config";
import { initWebSocketServer, stopHeartbeat } from "./lib/ws-hub";
import { startScheduledPaymentReminder, startPifNudgeWorker, startPledgeDefaultWorker, startCashoutReconciliation, startLedgerDriftMonitor, startNet30InvoiceReminderWorker } from "./lib/scheduler";
import {
  isRedisConfigured,
  assertProductionRedisReady,
  closeRedis,
  waitForRedisReady,
} from "./lib/queue";
import { closeWorkers } from "./lib/worker-lifecycle";
import {
  workerStarted,
  workerNoRedis,
  workerFailed,
  registerWorker,
} from "./lib/worker-registry";
import { startPayoutWorker } from "./workers/payout-worker";
import { startCashoutWorker } from "./workers/cashout-worker";
import { startPledgeWorker } from "./workers/pledge-worker";
import { startCleanupWorker, startCleanupWorkerLegacy } from "./workers/cleanup-worker";
import { startNotificationWorker } from "./workers/notification-worker";
import { startAnomalyDetectionWorker } from "./workers/anomaly-worker";
import { startNiaCheckinWorker } from "./workers/nia-checkin-worker";
import { startGriotTranscriptionWorker } from "./workers/griot-transcription-worker";
import { startNiaPushQueueWorker } from "./workers/nia-push-queue-worker";
import { startPoolMinimumsWorker } from "./workers/pool-minimums-worker";
import { startDailyKindnessWorker } from "./workers/daily-kindness-worker";
import { startPoolSettlementStatusWorker } from "./lib/advance-pool-settlement-status";
import { processRecurringRequests } from "./routes/recurring";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
const RECURRING_INTERVAL_MS = 60 * 60 * 1000; // 1 hour


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

if (
  process.env.NODE_ENV === "production" &&
  (!getStripeSecretKey() || !getStripeWebhookSecret())
) {
  throw new Error(
    "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set in production. " +
    "Community Pool payments cannot safely run without both live Stripe credentials."
  );
}

// Critical background work is part of the production correctness boundary.
// Do this before creating/listening on the HTTP server so a deployment cannot
// appear healthy while payout, cashout, notification, and reconciliation jobs
// are silently disabled.
assertProductionRedisReady();
if (process.env.NODE_ENV === "production") {
  // Do not advertise a healthy production API until Redis has completed its
  // initial handshake. Workers then inherit a known-good connection and can
  // recover automatically from later transient disconnects.
  await waitForRedisReady(15_000);
}

const server = http.createServer(app);

// ── HTTP server hardening ─────────────────────────────────────────────────────
// keepAliveTimeout must be > the proxy/load-balancer idle timeout (Railway uses
// 60s). Setting it to 65s means the server holds connections slightly longer
// than the LB, preventing the LB from forwarding a new request to a socket the
// server is about to close (the "502 race" seen on rolling restarts).
server.keepAliveTimeout = 65_000;
// headersTimeout must be > keepAliveTimeout so slow clients can't hold sockets
// open indefinitely by never finishing their HTTP headers.
server.headersTimeout = 66_000;

initWebSocketServer(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");

  // NOTE: The startup auto-approve job that used to run here has been REMOVED.
  // Policy change: ALL new user registrations (individual and org alike) now
  // start as approval_status='pending' and require explicit admin approval
  // via PATCH /api/admin/accounts/:id/approval before the account is usable.
  // Running an auto-approve job on every boot would silently undo this policy
  // on every deploy/restart, defeating the entire account-approval system.
  // See: routes/users.ts registration handler for the new policy.

  // The HTTP server must stay available so /healthz and /readiness can explain
  // the failure, but no worker should query or mutate an unavailable database.
  // Starting them anyway creates a noisy retry storm and can hide the actual
  // dependency failure behind dozens of unrelated "relation does not exist"
  // errors. Production deploys still fail readiness until the DB is reachable.
  try {
    const schemaResult = await db.execute<{ table_name: string | null }>(
      sql`SELECT to_regclass('public.help_requests') AS table_name`,
    );
    const schemaCheck = schemaResult.rows[0];
    if (!schemaCheck?.table_name) {
      throw new Error(
        "database schema is not migrated: public.help_requests is missing",
      );
    }
  } catch (err) {
    logger.error(
      { err },
      "database: unavailable or schema is not migrated — background workers are paused; readiness will remain unready",
    );
    return;
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
  registerWorker("griot-transcription", "Griot Transcription",    false);
  registerWorker("nia-push-queue",      "Nia Push Queue",         false);
  registerWorker("pool-minimums",       "Pool Minimums",          false);
  registerWorker("pledge-defaults",     "Pledge Default Sweeper", false);
  registerWorker("cashout-recon",       "Cashout Reconciliation", false);
  registerWorker("recurring-requests",  "Recurring Requests",     false);
  registerWorker("ledger-drift",        "Ledger/Stripe Drift",    false);
  registerWorker("net30-invoices",      "NET30 Invoice Reminders",false);
  registerWorker("daily-kindness",      "Daily Kindness Engine",  false);
  registerWorker("payment-reminder",    "Payment Reminder",       false);
  registerWorker("pool-settlement",     "Pool Settlement Status",  false);

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
    startScheduledPaymentReminder(); workerStarted("payment-reminder", "Payment Reminder", false);
    // Cleanup (request expiry + pre-expiry nudges) was previously BullMQ-only —
    // with no Redis configured it silently never ran at all. This interval-based
    // fallback keeps expiry, orphan-claim recycling, and requester notifications
    // working in any environment.
    startCleanupWorkerLegacy(); workerStarted("cleanup-worker", "Cleanup Worker", false);
  }

  // PIF repayment nudges — runs regardless of Redis (setInterval-based)
  startPifNudgeWorker(); workerStarted("pif-nudge", "PIF Nudge Scheduler", false);
  // Anomaly detection runs regardless of Redis
  startAnomalyDetectionWorker(); workerStarted("anomaly-worker", "Anomaly Detection", false);
  // 24h check-in worker — Nia follows up after every completed request
  startNiaCheckinWorker(); workerStarted("nia-checkin", "Nia 24h Check-in", false);
  // Griot transcription/translation pipeline — moves stories through
  // recorded → transcribing → pending_review (see griot-transcription-worker.ts
  // for the honest caveat on the audio-transcription step)
  startGriotTranscriptionWorker(); workerStarted("griot-transcription", "Griot Transcription", false);
  // Nia push queue consumer — drains push_notification_queue written by nia-service
  // ambient-presence and general-checkin workers; delivers via sendPushToUser every 5 min
  startNiaPushQueueWorker(); workerStarted("nia-push-queue", "Nia Push Queue", false);
  // Community Pool backfill — retries queued guaranteed minimums + low-balance alert
  startPoolMinimumsWorker(); workerStarted("pool-minimums", "Pool Minimums", false);
  // Pledge default automation — marks 90-day unpaid PIF pledges as defaulted + applies trust hit
  startPledgeDefaultWorker(); workerStarted("pledge-defaults", "Pledge Default Sweeper", false);
  // Cashout reconciliation — refunds stale pending/failed cashouts with no Stripe transfer
  startCashoutReconciliation(); workerStarted("cashout-recon", "Cashout Reconciliation", false);
  // Ledger/Stripe drift monitor — runs daily, alerts on > $10 gap
  startLedgerDriftMonitor(); workerStarted("ledger-drift", "Ledger/Stripe Drift", false);
  // NET30 invoice reminders — notify gov sponsors 7 days before civic invoice due
  startNet30InvoiceReminderWorker(); workerStarted("net30-invoices", "NET30 Invoice Reminders", false);
  // Daily Kindness Engine — morning push to active helpers with nearby open requests
  startDailyKindnessWorker(); workerStarted("daily-kindness", "Daily Kindness Engine", false);
  // Stripe Balance Transactions move from pending to available after the
  // webhook; keep the financial event and linked History projection current.
  startPoolSettlementStatusWorker(); workerStarted("pool-settlement", "Pool Settlement Status", false);
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
    await closeWorkers(30_000);
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
  }, 40_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ── Safety net: log unhandled promise rejections and exceptions ───────────────
// Without these handlers, Node silently swallows async errors in worker
// intervals and route callbacks, making production failures invisible.
// We log + continue (not exit) so a single bad worker tick doesn't kill
// all users' connections — Railway will restart on a real crash anyway.
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "unhandledRejection: caught — check for missing .catch() on a worker or route");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException: caught — this is a bug; server will attempt to continue");
  // Do NOT process.exit() here — let the app limp along so Railway can report
  // the error and orchestrate a clean restart via its health checks.
});
