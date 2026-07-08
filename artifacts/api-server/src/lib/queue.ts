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
// Trim whitespace and treat blank strings as absent so that an accidentally
// set-but-empty environment variable (e.g. `REDIS_URL=` in a Railway config)
// does not cause ioredis to attempt a connection to an empty host.
// Strip any accidental CLI prefix (e.g. "redis-cli --tls -u redis://...") so
// only the actual redis:// or rediss:// URL is passed to ioredis.
export function parseRedisUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Strip any accidental CLI prefix (e.g. "redis-cli --tls -u redis://...")
  const match = trimmed.match(/(rediss?:\/\/\S+)/);
  const url = match ? match[1] : trimmed;
  if (!url) return undefined;
  // Reject anything that doesn't look like a redis URL — placeholders like
  // "${{Redis.REDIS_URL}}", "redis-url", or a bare hostname will pass the
  // non-empty check above but would make ioredis attempt a nonsense connection,
  // silently appearing "configured" while jobs pile up unprocessed.
  if (!url.startsWith("redis://") && !url.startsWith("rediss://")) {
    logger.warn(
      { hint: "value does not start with redis:// or rediss://" },
      "queue: REDIS_URL is set but is not a valid redis URL — BullMQ queues disabled",
    );
    return undefined;
  }
  // A redis:// / rediss:// prefix alone isn't enough — values like
  // "redis://" or "redis://${{Redis.REDIS_URL}}" (an unresolved template
  // placeholder) pass the prefix check but are not connectable. Parse with
  // the URL constructor to confirm there's an actual hostname, and that the
  // string doesn't contain characters (e.g. "{", "}", "$") that indicate an
  // unresolved template rather than a real connection string.
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || /[{}$]/.test(url)) {
      throw new Error("missing hostname or contains template placeholder characters");
    }
  } catch {
    logger.warn(
      { hint: "value has a redis:// prefix but is not a structurally valid URL (missing/invalid host, or an unresolved template placeholder)" },
      "queue: REDIS_URL is set but is not a valid redis URL — BullMQ queues disabled",
    );
    return undefined;
  }
  // Upstash (and many cloud Redis providers) require TLS even when the URL
  // starts with redis:// rather than rediss://. Upgrade to rediss:// so
  // ioredis enables the TLS layer automatically.
  const hostname = url.replace(/rediss?:\/\/[^@]*@/, "").split(":")[0] ?? "";
  const needsTls =
    hostname.endsWith(".upstash.io") ||
    hostname.endsWith(".redis.cache.windows.net") ||
    hostname.endsWith(".redis.amazonaws.com");
  return needsTls ? url.replace(/^redis:\/\//, "rediss://") : url;
}
const REDIS_URL = parseRedisUrl(process.env["REDIS_URL"] ?? "");

/**
 * Distinguishes "not set at all" from "set but malformed" so ops tooling
 * (GET /api/admin/global-ops config_status, startup logs) can tell operators
 * exactly what's wrong instead of a single ambiguous boolean. This matters in
 * production: a malformed REDIS_URL silently disables pledge reminders,
 * payout retries, and cashout workers with no visible symptom besides a log
 * line that's easy to miss.
 */
export function getRedisUrlStatus(): "not_set" | "invalid_format" | "valid" {
  const raw = (process.env["REDIS_URL"] ?? "").trim();
  if (!raw) return "not_set";
  return REDIS_URL ? "valid" : "invalid_format";
}

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
  WALLET_CASHOUTS:       "niakofa-wallet-cashouts",
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

export const cashoutQueue       = createQueue(QUEUE.WALLET_CASHOUTS, {
  attempts: 5,
  backoff: { type: "exponential", delay: 5 * 60 * 1000 }, // same schedule as payout retries
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

// ── Convenience: enqueue a cashout retry ─────────────────────────────────────
export interface CashoutJobData {
  cashout_id:        number;
  user_id:           number;
  amount_cents:      number;
  stripe_account_id: string;
}

export async function enqueueCashoutRetry(data: CashoutJobData): Promise<boolean> {
  if (!cashoutQueue) {
    logger.warn({ cashout_id: data.cashout_id }, "redis unavailable — cashout retry not queued");
    return false;
  }
  await cashoutQueue.add("retry-cashout", data, {
    jobId: `cashout-${data.cashout_id}-${Date.now()}`,
  });
  logger.info({ cashout_id: data.cashout_id }, "cashout retry enqueued");
  return true;
}

// ── Convenience: enqueue a push notification ─────────────────────────────────
export interface NotificationJobData {
  user_id:    number;
  title:      string;
  body:       string;
  urgency?:   string;
  requestId?: number;
  notifType?: "nearby_requests" | "task_accepted" | "wallet" | "community" | "emergency" | "nia_checkin";
}

export async function enqueueNotification(data: NotificationJobData): Promise<boolean> {
  if (!notificationQueue) return false;
  await notificationQueue.add("push", data);
  return true;
}
