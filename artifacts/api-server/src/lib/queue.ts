/**
 * Niakofa — BullMQ Queue Infrastructure
 *
 * Provides a shared Redis connection (via ioredis) and queue factories.
 * Development can degrade gracefully when REDIS_URL is unset. Production
 * startup must reject that configuration because money-moving and notification
 * work cannot safely depend on interval fallbacks.
 *
 * Environment:
 *   REDIS_URL or REDIS_URLS — Redis connection string
 *   (redis://user:pass@host:6379). REDIS_URLS is accepted because some
 *   managed Redis providers expose the connection under the plural name.
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
      "queue: Redis connection setting is not a valid redis URL — BullMQ queues disabled",
    );
    return undefined;
  }
  // A redis:// / rediss:// prefix alone isn't enough — values like
  // "redis://" or "redis://${{Redis.REDIS_URL}}" (an unresolved template
  // placeholder) pass the prefix check but are not connectable. Parse with
  // the URL constructor to confirm there's an actual hostname, and reject
  // unresolved `${{...}}` / `${...}` template placeholders specifically —
  // NOT bare "$", which is a legal character in Redis userinfo credentials
  // (e.g. "redis://user:pa$@host:6379" is a valid URL and must pass).
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!parsed.hostname || /\$\{[^}]*\}/.test(url) || /[{}]/.test(parsed.hostname)) {
      throw new Error("missing hostname or contains an unresolved template placeholder");
    }
  } catch {
    logger.warn(
      { hint: "value has a redis:// prefix but is not a structurally valid URL (missing/invalid host, or an unresolved template placeholder)" },
      "queue: Redis connection setting is not a valid redis URL — BullMQ queues disabled",
    );
    return undefined;
  }
  // Upstash (and many cloud Redis providers) require TLS even when the URL
  // starts with redis:// rather than rediss://. Upgrade to rediss:// so
  // ioredis enables the TLS layer automatically.
  const hostname = parsed.hostname.toLowerCase();
  const needsTls =
    hostname.endsWith(".upstash.io") ||
    hostname.endsWith(".redis.cache.windows.net") ||
    hostname.endsWith(".redis.amazonaws.com");
  return needsTls ? url.replace(/^redis:\/\//, "rediss://") : url;
}

type RedisEnvironment = Partial<Pick<NodeJS.ProcessEnv, "REDIS_URL" | "REDIS_URLS">>;

function redisCandidates(raw: string | undefined): string[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];

  // Accept a provider's JSON array or a plain value. For a delimited plain
  // value, extract only complete Redis URLs and never log the secret itself.
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      // Fall through to the normal invalid-format path.
    }
  }
  const matches = trimmed.match(/rediss?:\/\/[^\s,\]}"']+/gi);
  return matches?.length ? matches : [trimmed];
}

export function resolveRedisUrl(env: RedisEnvironment = process.env): string | undefined {
  const candidates = [
    ...redisCandidates(env.REDIS_URL),
    ...redisCandidates(env.REDIS_URLS),
  ];
  return candidates.map(parseRedisUrl).find((value): value is string => Boolean(value));
}

const REDIS_URL = resolveRedisUrl();

/**
 * Distinguishes "not set at all" from "set but malformed" so ops tooling
 * (GET /api/admin/global-ops config_status, startup logs) can tell operators
 * exactly what's wrong instead of a single ambiguous boolean. This matters in
 * production: a malformed Redis URL silently disables pledge reminders,
 * payout retries, and cashout workers with no visible symptom besides a log
 * line that's easy to miss.
 */
export function getRedisUrlStatus(): "not_set" | "invalid_format" | "valid" {
  const hasValue = Boolean(
    (process.env["REDIS_URL"] ?? "").trim() ||
    (process.env["REDIS_URLS"] ?? "").trim(),
  );
  if (!hasValue) return "not_set";
  return REDIS_URL ? "valid" : "invalid_format";
}

/**
 * Returns the startup error for an unsafe production queue configuration.
 * Keeping this pure makes the fail-closed boundary easy to regression-test
 * without opening a Redis connection or importing the HTTP server.
 */
export function productionRedisRequirementError(
  nodeEnv: string | undefined,
  redisStatus: "not_set" | "invalid_format" | "valid",
): string | undefined {
  if (nodeEnv !== "production" || redisStatus === "valid") return undefined;

  if (redisStatus === "invalid_format") {
    return (
      "Redis configuration is present in production but is not a valid redis:// or rediss:// URL. " +
      "Set a resolved REDIS_URL or REDIS_URLS connection URL before starting the API."
    );
  }

  return (
    "REDIS_URL or REDIS_URLS is required in production. " +
    "Set a durable Redis connection URL before starting the API."
  );
}

/** Fail closed before the API can accept production traffic. */
export function assertProductionRedisReady(): void {
  const error = productionRedisRequirementError(
    process.env["NODE_ENV"],
    getRedisUrlStatus(),
  );
  if (error) throw new Error(error);
}

let _workerConnection: IORedis | null = null;
let _queueConnection: IORedis | null = null;

function attachRedisLogging(connection: IORedis, role: "worker" | "queue"): void {
  connection.on("connect", () => logger.info({ role }, "redis: connected"));
  connection.on("ready", () => logger.info({ role }, "redis: ready"));
  connection.on("error", (err: Error) => logger.warn({ role, err }, "redis: connection error"));
  connection.on("reconnecting", (delay: number) => logger.info({ role, delay }, "redis: reconnecting"));
  connection.on("end", () => logger.warn({ role }, "redis: connection ended"));
}

/**
 * Worker connections keep retrying through transient Redis outages.
 * BullMQ requires maxRetriesPerRequest=null for worker clients.
 */
export function getRedisConnection(): IORedis | null {
  if (!REDIS_URL) return null;
  if (_workerConnection) return _workerConnection;

  _workerConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(Math.max(times * 1_000, 1_000), 20_000),
  });
  attachRedisLogging(_workerConnection, "worker");
  return _workerConnection;
}

/**
 * Queue/producer connections fail quickly when Redis is unavailable. HTTP
 * handlers must not inherit the worker's indefinite retry policy.
 */
export function getQueueConnection(): IORedis | null {
  if (!REDIS_URL) return null;
  if (_queueConnection) return _queueConnection;

  _queueConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    lazyConnect: false,
    connectTimeout: 5_000,
    retryStrategy: (times) => Math.min(Math.max(times * 250, 250), 2_000),
  });
  attachRedisLogging(_queueConnection, "queue");
  return _queueConnection;
}

export function isRedisConfigured(): boolean {
  return !!REDIS_URL;
}

export async function waitForRedisReady(timeoutMs = 10_000): Promise<void> {
  if (!REDIS_URL) throw new Error("Redis is not configured");
  const connections = [getRedisConnection(), getQueueConnection()].filter(Boolean) as IORedis[];
  if (!connections.length) throw new Error("Redis is not configured");

  await Promise.all(connections.map(async (connection) => {
    if (connection.status === "ready") return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Redis did not become ready within ${timeoutMs}ms`));
      }, timeoutMs);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        logger.warn({ err }, "redis: startup connection error; retrying");
      };
      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        connection.off("ready", onReady);
        connection.off("error", onError);
      };
      connection.once("ready", onReady);
      connection.on("error", onError);
    });
  }));
}

export async function closeRedis(): Promise<void> {
  const connections = [_queueConnection, _workerConnection].filter(Boolean) as IORedis[];
  _queueConnection = null;
  _workerConnection = null;
  await Promise.all(connections.map(async (connection) => {
    try {
      if (connection.status !== "end") await connection.quit();
    } catch (err) {
      logger.warn({ err }, "redis: graceful close failed; disconnecting");
      connection.disconnect();
    }
  }));
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
  const conn = getQueueConnection();
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
    jobId: `payout-${data.request_id}`,
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
    jobId: `cashout-${data.cashout_id}`,
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
