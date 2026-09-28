import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "niakofa_exchange_spark_playback";
const PURPOSE = "exchange-spark-video-playback-v1";
const TTL_SECONDS = 120;

type Claims = { assetId: number; userId: number; tokenVersion: number; expiresAt: number };

function signature(claims: Claims, secret: string): string {
  return createHmac("sha256", secret)
    .update([PURPOSE, claims.assetId, claims.userId, claims.tokenVersion, claims.expiresAt].join("\n"))
    .digest("base64url");
}

export function issueExchangeSparkPlaybackGrant(
  assetId: number,
  userId: number,
  tokenVersion: number,
  secret: string,
  secure: boolean,
): { cookie: string; expiresAt: number } {
  if (!secret || secret.length < 32 || !Number.isSafeInteger(assetId) || assetId <= 0
    || !Number.isSafeInteger(userId) || userId <= 0
    || !Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    throw new Error("Invalid secure Spark playback grant.");
  }
  const claims = { assetId, userId, tokenVersion, expiresAt: Date.now() + TTL_SECONDS * 1000 };
  const value = `v1.${assetId}.${userId}.${tokenVersion}.${claims.expiresAt}.${signature(claims, secret)}`;
  const cookie = `${COOKIE}=${value}; Path=/api/media-assets/${assetId}/play; HttpOnly; SameSite=Strict; Max-Age=${TTL_SECONDS}${secure ? "; Secure" : ""}`;
  return { cookie, expiresAt: claims.expiresAt };
}

export function verifyExchangeSparkPlaybackGrant(
  header: unknown,
  assetId: number,
  secret: string | undefined,
): Claims | null {
  if (typeof header !== "string" || header.length > 8192 || !secret || secret.length < 32
    || !Number.isSafeInteger(assetId) || assetId <= 0) return null;
  const values = header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== COOKIE) return [];
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9._-]{1,256}$/.test(value) ? [value] : [""];
  });
  if (values.length !== 1 || !values[0]) return null;
  const parts = values[0].split(".");
  if (parts.length !== 6 || parts[0] !== "v1"
    || !parts.slice(1, 5).every((part) => /^\d+$/.test(part))) return null;
  const claims = {
    assetId: Number(parts[1]),
    userId: Number(parts[2]),
    tokenVersion: Number(parts[3]),
    expiresAt: Number(parts[4]),
  };
  if (claims.assetId !== assetId || !Number.isSafeInteger(claims.userId) || claims.userId <= 0
    || !Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0
    || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= Date.now()
    || claims.expiresAt > Date.now() + TTL_SECONDS * 1000
    || String(claims.assetId) !== parts[1] || String(claims.userId) !== parts[2]
    || String(claims.tokenVersion) !== parts[3] || String(claims.expiresAt) !== parts[4]) return null;
  const actual = Buffer.from(parts[5], "base64url");
  const expected = Buffer.from(signature(claims, secret), "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? claims : null;
}