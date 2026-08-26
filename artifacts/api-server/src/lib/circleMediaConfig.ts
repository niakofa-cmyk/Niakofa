/** Validate the server-side LiveKit endpoint before returning it to clients. */
export function isValidLiveKitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "wss:" || url.protocol === "ws:") && Boolean(url.hostname);
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