export interface LiveKitUrlValidationOptions {
  /**
   * Local ws:// endpoints are useful for development, but must never be
   * returned by a production API because an HTTPS browser will reject them as
   * mixed content and they are not reachable by other devices.
   */
  allowLocalWs?: boolean;
}

/** Validate the server-side LiveKit endpoint before returning it to clients. */
export function isValidLiveKitUrl(
  value: string,
  options: LiveKitUrlValidationOptions = {},
): boolean {
  const allowLocalWs =
    options.allowLocalWs ?? process.env.NODE_ENV !== "production";

  try {
    const url = new URL(value);
    if (url.username || url.password || !url.hostname) return false;
    if (url.protocol === "wss:") return true;
    // Plain WebSockets are useful for local development, but returning a
    // remote ws:// endpoint from an HTTPS app would expose the media token and
    // fail in browsers as mixed content.
    return allowLocalWs &&
      url.protocol === "ws:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Route params must identify one concrete database row. Number.parseInt would
 * accept values such as "12abc", so validate the complete decimal identifier
 * and reject values outside JavaScript's exact integer range.
 */
export function parsePositiveSafeInteger(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}