/**
 * Niakofa — BullMQ Queue Infrastructure
 *
 * Provides a shared Redis connection (via ioredis) and queue factories.
 * All queues degrade gracefully when REDIS_URL is unset — the server
 * starts normally and workers simply don't register.
 *
 * Environment:
 *   REDIS_URL — Redis connection string (redis://user:pass@host:6379)
 *               On Railway this is ${{Redis.REDIS_URL}} or REDIS_PRIVATE_URL.
 */
import IORedis from "ioredis";
import { Queue, type JobsOptions } from "bullmq";
import { logger } from "./logger";

// ── Redis connection ──────────────────────────────────────────────────────────
const REDIS_URL = process.env["REDIS_URL"];

let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis | null {
  if (!REDIS_URL) return null;
  if (_connection) return _connection;

  _connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,   // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
  });

  _connection.on("connect", () => logger.info("redis: connected"));
  _connection.on("error", (err: Error) => logger.warn({ err }, "redis: connection error"));
  _connection.on("reconnecting", () => logger.info("redis: reconnecting…"));

  return _connection;
}

export function isRedisConfigured(): boolean {
  return !!REDIS_URL;
}

export async function closeRedis(): Promise<void> {
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}

// ── Queue names ───────────────────────────────────────────────────────────────
export const QUEUE = {
  PAYOUTS:               "niakofa-payouts",
  PLEDGE_RECONCILIATION: "niakofa-pledge-reconciliation",
  REQUEST_CLEANUP:       "niakofa-request-cleanup",
  NOTIFICATIONS:         "niakofa-notifications",
} as const;

// ── Default job options ───────────────────────────────────────────────────────
const SHARED_DEFAULTS: JobsOptions = {
  removeOnComplete: { count: 200 },
  removeOnFail:     { count: 500 },
};

// ── Queue factory (returns null when Redis unavailable) ───────────────────────
export function createQueue(name: string, defaults?: JobsOptions): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  return new Queue(name, {
    connection: conn,
    defaultJobOptions: { ...SHARED_DEFAULTS, ...defaults },
  });
}

// ── Shared queue singletons ───────────────────────────────────────────────────
// These are created once at module load. callers should null-check before use.
export const payoutQueue        = createQueue(QUEUE.PAYOUTS, {
  attempts: 5,
  backoff: { type: "exponential", delay: 5 * 60 * 1000 }, // 5min → 10min → 20min → 40min → 80min
});

export const pledgeQueue        = createQueue(QUEUE.PLEDGE_RECONCILIATION);
export const cleanupQueue       = createQueue(QUEUE.REQUEST_CLEANUP);
export const notificationQueue  = createQueue(QUEUE.NOTIFICATIONS, {
  attempts: 3,
  backoff: { type: "fixed", delay: 30_000 },
});

// ── Convenience: enqueue a payout retry ──────────────────────────────────────
export interface PayoutJobData {
  request_id:         number;
  helper_id:          number;
  requester_id:       number;
  amount_cents:       number;
  platform_fee_cents: number;
  stripe_account_id:  string;
  request_title:      string;
}

export async function enqueuePayoutRetry(data: PayoutJobData): Promise<boolean> {
  if (!payoutQueue) {
    logger.warn({ request_id: data.request_id }, "redis unavailable — payout retry not queued");
    return false;
  }
  await payoutQueue.add("retry-payout", data, {
    jobId: `payout-${data.request_id}-${Date.now()}`,
  });
  logger.info({ request_id: data.request_id }, "payout retry enqueued");
  return true;
}

// ── Convenience: enqueue a push notification ─────────────────────────────────
export interface NotificationJobData {
  user_id:    number;
  title:      string;
  body:       string;
  urgency?:   string;
  requestId?: number;
}

export async function enqueueNotification(data: NotificationJobData): Promise<boolean> {
  if (!notificationQueue) return false;
  await notificationQueue.add("push", data);
  return true;
}
