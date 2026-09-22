/**
 * Niakofa — DB Retry Wrapper
 *
 * Wraps a Drizzle query callback with exponential-backoff retry logic for
 * transient Postgres errors (connection resets, serialization failures,
 * deadlocks, and pool timeouts). Fatal errors (syntax, constraint violations,
 * 404-style not-found results) are NOT retried — they propagate immediately.
 *
 * Usage:
 *   const user = await withRetry(() => db.select().from(usersTable).where(eq(usersTable.id, id)));
 *
 * For critical paths (payments, ledger writes) use a lower maxAttempts to
 * fail fast rather than retrying something that holds a row lock.
 */
import { logger } from "./logger";

// Postgres error codes that are safe to retry (transient, not data bugs)
const RETRYABLE_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "08006", // connection_failure
  "08001", // unable_to_connect
  "08004", // rejected_connection
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "53300", // too_many_connections
]);

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code && RETRYABLE_PG_CODES.has(code)) return true;
  // Pool timeout / ETIMEDOUT — pg-pool throws a plain Error with no code
  const msg = (err as Error).message?.toLowerCase() ?? "";
  return msg.includes("connection timeout") || msg.includes("query read timeout") || msg.includes("etimedout");
}

interface RetryOptions {
  /** Maximum total attempts (first try + retries). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before first retry. Doubled on each retry. Default: 100 */
  baseDelayMs?: number;
  /** Max delay cap in ms. Default: 2000 */
  maxDelayMs?: number;
  /** Context label for logging. Default: "db-retry" */
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 2000,
    label = "db-retry",
  } = options;

  let attempt = 0;
  let lastErr: unknown;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      // Add ±20% jitter so multiple failing requests don't thunderherd
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      const wait = Math.round(delay + jitter);

      logger.warn(
        { label, attempt, maxAttempts, wait_ms: wait, err_code: (err as { code?: string }).code },
        `${label}: transient DB error — retrying in ${wait}ms`,
      );
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }

  throw lastErr;
}
