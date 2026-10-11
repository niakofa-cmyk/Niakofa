/**
 * Pure helpers for the Moments feed player. No DOM, no network: everything the
 * player needs to decide is here so it can be unit-tested without a browser.
 */

export const SEEK_STEP_S = 5;
/** Playback grants live 120 s server-side (STORY_PLAYBACK_TTL_SECONDS). Reuse a prefetched one for at most half that. */
export const PREFETCH_GRANT_TTL_MS = 60_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Duration to scrub against. MediaRecorder WebM often reports Infinity, so fall back to the seekable
 * range and then to the duration the server recorded for the media.
 */
export function effectiveDurationS(durationS: number, seekableEndS: number | null, hintMs: number | null | undefined): number {
  if (finitePositive(durationS)) return durationS;
  if (seekableEndS !== null && finitePositive(seekableEndS)) return seekableEndS;
  return hintMs && finitePositive(hintMs) ? hintMs / 1000 : 0;
}

/** 0..1 progress; 0 while the duration is unknown (MediaRecorder WebM reports Infinity). */
export function playbackFraction(currentS: number, durationS: number): number {
  if (!finitePositive(durationS) || !Number.isFinite(currentS)) return 0;
  return clamp(currentS / durationS, 0, 1);
}

export function timeFromFraction(fraction: number, durationS: number): number {
  if (!finitePositive(durationS) || !Number.isFinite(fraction)) return 0;
  return clamp(fraction, 0, 1) * durationS;
}

export function fractionFromPointer(clientX: number, left: number, width: number): number {
  if (!finitePositive(width) || !Number.isFinite(clientX)) return 0;
  return clamp((clientX - left) / width, 0, 1);
}

/** Keyboard/assistive seek. Stops just short of the end so an arrow press never ends playback. */
export function steppedSeek(currentS: number, durationS: number, deltaS: number): number {
  if (!finitePositive(durationS)) return 0;
  return clamp((Number.isFinite(currentS) ? currentS : 0) + deltaS, 0, Math.max(0, durationS - 0.05));
}

export type PreloadCandidate = { hasVideo: boolean; ready: boolean };

/** The next card worth warming: the first following card with a playable video. Never looks past `lookahead`. */
export function nextPreloadIndex(items: readonly PreloadCandidate[], activeIndex: number, lookahead = 2): number | null {
  for (let offset = 1; offset <= lookahead; offset++) {
    const candidate = items[activeIndex + offset];
    if (!candidate) return null;
    if (candidate.hasVideo && candidate.ready) return activeIndex + offset;
  }
  return null;
}

export type ConnectionHint = { saveData?: boolean; effectiveType?: string } | null | undefined;

/** Warm the video bytes only on a good connection; always allowed to warm just the grant. */
export function shouldWarmVideoBytes(connection: ConnectionHint): boolean {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "");
}

export type CachedGrant = { url: string; at: number };

export function freshGrant(entry: CachedGrant | undefined, now: number): string | null {
  return entry && now - entry.at < PREFETCH_GRANT_TTL_MS ? entry.url : null;
}
