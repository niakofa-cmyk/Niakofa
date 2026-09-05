import { logger } from "./logger";

const DEFAULT_TIMEOUT_MS = 30_000;

export class NiaServiceError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
    this.name = "NiaServiceError";
  }
}

export function getNiaServiceUrl(): string {
  return (process.env["NIA_SERVICE_URL"] ?? "http://localhost:3001").replace(/\/$/, "");
}

/**
 * The only non-route API-server entry point for service-to-service Nia HTTP.
 * Keeping the secret and timeout policy here makes it difficult for a worker
 * or feature route to accidentally create an unauthenticated Nia bypass.
 */
export async function requestNia(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new NiaServiceError("Nia service path must be relative", 500);
  }

  const internalSecret = process.env["INTERNAL_SECRET"];
  if (!internalSecret) {
    throw new NiaServiceError("Nia internal secret is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  headers.set("x-internal-secret", internalSecret);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  try {
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    return await fetch(`${getNiaServiceUrl()}${path}`, {
      ...init,
      headers,
      signal,
    });
  } catch (error) {
    logger.warn({ err: error, path }, "nia-client: Nia service request failed");
    throw new NiaServiceError("Nia service is unavailable");
  } finally {
    clearTimeout(timeout);
  }
}