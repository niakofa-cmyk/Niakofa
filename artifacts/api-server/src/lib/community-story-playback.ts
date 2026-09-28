import { createHmac, timingSafeEqual } from "node:crypto";

export const STORY_PLAYBACK_COOKIE_NAME = "niakofa_story_playback";
export const STORY_PLAYBACK_TTL_SECONDS = 120;

const PLAYBACK_PURPOSE = "community-story-video-playback-v1";

export type StoryPlaybackClaims = {
  mediaId: number;
  userId: number;
  tokenVersion: number;
  expiresAt: number;
};

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function playbackSignature(claims: StoryPlaybackClaims, secret: string): string {
  return createHmac("sha256", secret)
    .update([
      PLAYBACK_PURPOSE,
      claims.mediaId,
      claims.userId,
      claims.tokenVersion,
      claims.expiresAt,
    ].join("\n"))
    .digest("base64url");
}

export function issueStoryPlaybackGrant(
  input: Omit<StoryPlaybackClaims, "expiresAt">,
  secret: string,
  now = Date.now(),
): { value: string; claims: StoryPlaybackClaims } {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  if (!isPositiveSafeInteger(input.mediaId) || !isPositiveSafeInteger(input.userId)
    || !Number.isSafeInteger(input.tokenVersion) || input.tokenVersion < 0) {
    throw new Error("Invalid Story playback grant claims.");
  }
  const claims: StoryPlaybackClaims = {
    ...input,
    expiresAt: now + STORY_PLAYBACK_TTL_SECONDS * 1000,
  };
  const value = `v1.${claims.mediaId}.${claims.userId}.${claims.tokenVersion}.${claims.expiresAt}.${playbackSignature(claims, secret)}`;
  return { value, claims };
}

export function verifyStoryPlaybackGrant(
  value: unknown,
  expectedMediaId: number,
  secret: string,
  now = Date.now(),
): StoryPlaybackClaims | null {
  if (typeof value !== "string" || value.length > 256 || !secret || secret.length < 32
    || !isPositiveSafeInteger(expectedMediaId)) return null;
  const parts = value.split(".");
  if (parts.length !== 6 || parts[0] !== "v1") return null;
  const [, mediaRaw, userRaw, versionRaw, expiryRaw, suppliedSignature] = parts;
  if (![mediaRaw, userRaw, versionRaw, expiryRaw].every((part) => /^\d+$/.test(part))) return null;
  const claims = {
    mediaId: Number(mediaRaw),
    userId: Number(userRaw),
    tokenVersion: Number(versionRaw),
    expiresAt: Number(expiryRaw),
  };
  if (!isPositiveSafeInteger(claims.mediaId) || !isPositiveSafeInteger(claims.userId)
    || !Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0
    || !Number.isSafeInteger(claims.expiresAt)
    || String(claims.mediaId) !== mediaRaw || String(claims.userId) !== userRaw
    || String(claims.tokenVersion) !== versionRaw || String(claims.expiresAt) !== expiryRaw
    || claims.mediaId !== expectedMediaId || claims.expiresAt <= now
    || claims.expiresAt > now + STORY_PLAYBACK_TTL_SECONDS * 1000) return null;

  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(playbackSignature(claims, secret), "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return claims;
}

export function buildStoryPlaybackSetCookie(value: string, mediaId: number, secure: boolean): string {
  if (!isPositiveSafeInteger(mediaId) || !/^[A-Za-z0-9._-]{1,256}$/.test(value)) {
    throw new Error("Invalid Story playback cookie.");
  }
  const secureAttribute = secure ? "; Secure" : "";
  // Scope the grant to this media resource so the legacy direct URL can be
  // protected without exposing a broader session cookie.
  return `${STORY_PLAYBACK_COOKIE_NAME}=${value}; Path=/api/community/stories/media/${mediaId}; HttpOnly; SameSite=Strict; Max-Age=${STORY_PLAYBACK_TTL_SECONDS}${secureAttribute}`;
}

/**
 * Deliberately narrow cookie parser: rejects oversized headers, duplicate
 * playback cookies, quoted/encoded values, and anything outside the token
 * alphabet. No cookie-parser dependency or token logging is involved.
 */
export function readStoryPlaybackCookie(cookieHeader: unknown): string | null {
  if (typeof cookieHeader !== "string" || cookieHeader.length > 8_192) return null;
  const matches = cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== STORY_PLAYBACK_COOKIE_NAME) return [];
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9._-]{1,256}$/.test(value) ? [value] : [""];
  });
  return matches.length === 1 && matches[0] ? matches[0] : null;
}