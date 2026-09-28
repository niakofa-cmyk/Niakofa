/**
 * Network-safe mutation helper.
 *
 * Every retryable mutation gets one stable key for its logical operation.
 * We retry only transport failures and 5xx responses; 4xx responses are
 * actionable business/auth errors and must not be hidden from the caller.
 * This does not persist or replay mutations after the user leaves the page.
 */
export class OfflineMutationError extends Error {
  readonly offline = true;
  constructor(message = "You're offline. Reconnect and retry this action.") {
    super(message);
    this.name = "OfflineMutationError";
  }
}

export function newOperationKey(scope: string, id?: number | string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}${id == null ? "" : `-${id}`}-${suffix}`;
}

export interface RetryableMutationDependencies {
  /** Injectable transport and connectivity checks keep fault tests deterministic. */
  fetcher?: typeof fetch;
  isOnline?: () => boolean;
  wait?: (milliseconds: number) => Promise<void>;
}

export async function retryableMutation(
  input: RequestInfo | URL,
  init: RequestInit,
  idempotencyKey: string,
  attempts = 3,
  dependencies: RetryableMutationDependencies = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", idempotencyKey);
  const transport = dependencies.fetcher ?? fetch;
  const isOnline = dependencies.isOnline
    ?? (() => typeof navigator === "undefined" || navigator.onLine);
  const wait = dependencies.wait
    ?? ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isOnline()) {
      throw new OfflineMutationError();
    }
    try {
      const response = await transport(input, { ...init, headers });
      if (response.status < 500 || attempt === attempts - 1) {
        return response;
      }
      await wait(400 * 2 ** attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await wait(400 * 2 ** attempt);
    }
  }
  throw new OfflineMutationError(lastError instanceof Error ? lastError.message : undefined);
}