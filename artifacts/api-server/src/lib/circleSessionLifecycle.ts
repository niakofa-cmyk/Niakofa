/**
 * Spiral/Circle live-session lifecycle constants.
 *
 * Session duration and media-credential TTL are intentionally different:
 * - A live Spiral may run for up to MAX_SESSION_DURATION_MS (4 hours).
 * - LiveKit media tokens are short-lived (TOKEN_TTL) and must be re-minted
 *   by the client before expiry so the room stays connected without a page refresh.
 * - If no host and no co-host remain present for HOST_GRACE_PERIOD_MS (90s),
 *   the session ends (co-host is promoted first when one is still present).
 */

/** How long a host may be absent before failover/end. Also used for ghost sweeps. */
export const HOST_GRACE_PERIOD_MS = 90_000;

/** Maximum wall-clock length of a single live Spiral/Circle session. */
export const MAX_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

/** LiveKit credential lifetime — not the session length. Client must refresh. */
export const MEDIA_TOKEN_TTL_SECONDS = 60 * 20; // 20 minutes

/** Client should re-request a token this many seconds before JWT expiry. */
export const MEDIA_TOKEN_REFRESH_BEFORE_SECONDS = 90;

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
