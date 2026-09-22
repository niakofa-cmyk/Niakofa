/**
 * Network-safe mutation helper.
 *
 * Every replayable mutation gets one stable key for its logical operation.
 * We retry only transport failures and 5xx responses; 4xx responses are
 * actionable business/auth errors and must not be hidden from the caller.
 */
export class OfflineMutationError extends Error {
  readonly offline = true;
  constructor(message = "You're offline. Keep this screen open and try again when connected.") {
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

export async function retryableMutation(
  input: RequestInfo | URL,
  init: RequestInit,
  idempotencyKey: string,
  attempts = 3,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", idempotencyKey);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new OfflineMutationError();
    }
    try {
      const response = await fetch(input, { ...init, headers });
      if (response.ok || (response.status >= 400 && response.status < 500) || attempt === attempts - 1) {
        return response;
      }
      await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
    }
  }
  throw new OfflineMutationError(lastError instanceof Error ? lastError.message : undefined);
}