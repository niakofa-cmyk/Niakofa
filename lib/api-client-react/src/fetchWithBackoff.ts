/**
 * Fetch helper for transient throttling and server failures.
 *
 * Idempotent requests retry 429 and 5xx responses with exponential backoff,
 * jitter, and Retry-After support. Mutating requests are never retried unless
 * the caller explicitly opts in, which avoids replaying a payment or write.
 */
export type FetchWithBackoffOptions = RequestInit & {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryNonIdempotent?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function isIdempotent(method: string | undefined): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS";
}

function optionNumber(value: number | undefined, fallback: number, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, value as number) : fallback;
}

export async function fetchWithBackoff(
  input: RequestInfo | URL,
  options: FetchWithBackoffOptions = {},
): Promise<Response> {
  const {
    maxAttempts: requestedAttempts,
    baseDelayMs: requestedBaseDelay,
    maxDelayMs: requestedMaxDelay,
    retryNonIdempotent = false,
    ...init
  } = options;
  const maxAttempts = Math.floor(optionNumber(requestedAttempts, 4, 1));
  const baseDelayMs = optionNumber(requestedBaseDelay, 1_000, 0);
  const maxDelayMs = Math.max(baseDelayMs, optionNumber(requestedMaxDelay, 15_000, 0));
  const canRetryMethod = isIdempotent(init.method) || retryNonIdempotent;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const retryableStatus = response.status === 429 || response.status >= 500;
      if (!retryableStatus || attempt === maxAttempts || !canRetryMethod) {
        return response;
      }

      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      const exponentialMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const waitBaseMs = Math.min(maxDelayMs, retryAfterMs ?? exponentialMs);
      const jitterMs = Math.min(250, Math.max(0, maxDelayMs - waitBaseMs));
      await sleep(waitBaseMs + Math.floor(Math.random() * jitterMs));
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !canRetryMethod) throw error;
      const exponentialMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitterMs = Math.min(250, Math.max(0, maxDelayMs - exponentialMs));
      await sleep(exponentialMs + Math.floor(Math.random() * jitterMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("fetchWithBackoff: exhausted retries without a terminal response");
}