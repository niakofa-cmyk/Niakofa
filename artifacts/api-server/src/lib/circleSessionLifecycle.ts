/**
 * Spiral/Circle live-session lifecycle constants.
 *
 * - A live Spiral may run for up to MAX_SESSION_DURATION_MS (4 hours).
 * - LiveKit media tokens are minted for the *remaining* session lifetime so the
 *   Host and listeners are not interrupted by credential refresh mid-Spiral.
 * - If no host and no co-host remain present for HOST_GRACE_PERIOD_MS (90s),
 *   the session ends (co-host is promoted first when one is still present).
 */

/** How long a host may be absent before failover/end. Also used for ghost sweeps. */
export const HOST_GRACE_PERIOD_MS = 90_000;

/** Maximum wall-clock length of a single live Spiral/Circle session. */
export const MAX_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Media token TTL matches session max so a normal Spiral never forces a
 * mid-session LiveKit reconnect. Remaining time is computed at mint time.
 */
export const MEDIA_TOKEN_TTL_SECONDS = Math.floor(MAX_SESSION_DURATION_MS / 1000); // 4 hours

export function sessionAgeMs(startedAt: Date | string | null | undefined): number | null {
  if (!startedAt) return null;
  const t = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

export function isSessionPastMaxDuration(startedAt: Date | string | null | undefined): boolean {
  const age = sessionAgeMs(startedAt);
  return age != null && age >= MAX_SESSION_DURATION_MS;
}

/** Seconds remaining until the 4-hour session hard cap (min 60s when still live). */
export function remainingSessionTokenTtlSeconds(
  startedAt: Date | string | null | undefined,
): number {
  const age = sessionAgeMs(startedAt);
  if (age == null) return MEDIA_TOKEN_TTL_SECONDS;
  const remainingMs = MAX_SESSION_DURATION_MS - age;
  if (remainingMs <= 0) return 0;
  // Floor to whole seconds; never issue a sub-minute token for a still-live room.
  return Math.max(60, Math.floor(remainingMs / 1000));
}
