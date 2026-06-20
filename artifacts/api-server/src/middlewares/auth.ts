import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * HMAC-SHA256 stateless auth tokens, with a server-side revocation hook.
 *
 * Token format: "<userId>.<expiresAt>.<tokenVersion>.<base64url(hmac-sha256(userId.expiresAt.tokenVersion, SESSION_SECRET))>"
 *
 * REVOCATION: tokenVersion is checked against the user's current
 * token_version column on every request (in parseAuth). Bumping that
 * column — on logout or password change — immediately invalidates every
 * previously issued token for that user, even ones that haven't expired
 * yet. This is coarse-grained (logout-everywhere, not per-device), which
 * matches this token scheme's existing lack of per-session tracking.
 *
 * SERVER STARTUP GUARD
 * SESSION_SECRET must be set before this module is loaded.
 * We throw immediately — a server that starts with an empty secret would issue
 * trivially forgeable tokens where every userId maps to the same signature.
 */

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error(
    "FATAL: SESSION_SECRET environment variable is not set. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
    "and add it to Railway → Variables."
  );
}

// From this point SESSION_SECRET is guaranteed to be a non-empty string.
const SECRET: string = SESSION_SECRET;

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signTokenById(userId: number, tokenVersion: number): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const sig = createHmac("sha256", SECRET).update(`${userId}.${expiresAt}.${tokenVersion}`).digest("base64url");
  return `${userId}.${expiresAt}.${tokenVersion}.${sig}`;
}

/**
 * Verify a token's signature and expiry only — this is a pure, synchronous
 * function with no DB access. It does NOT check token_version against the
 * database; that happens in parseAuth, since only parseAuth runs on every
 * request and has the context to do so without duplicating DB lookups
 * elsewhere.
 */
export function verifyToken(token: string): { userId: number; tokenVersion: number; valid: boolean } {
  const parts = token.split(".");
  if (parts.length !== 4) return { userId: 0, tokenVersion: 0, valid: false };

  const [userIdRaw, expiresAtRaw, tokenVersionRaw, sig] = parts;
  const userId = parseInt(userIdRaw, 10);
  const expiresAt = parseInt(expiresAtRaw, 10);
  const tokenVersion = parseInt(tokenVersionRaw, 10);
  if (isNaN(userId) || userId <= 0 || isNaN(expiresAt) || isNaN(tokenVersion) || !sig) {
    return { userId: 0, tokenVersion: 0, valid: false };
  }

  if (Date.now() > expiresAt) return { userId, tokenVersion, valid: false }; // expired

  const expected = createHmac("sha256", SECRET).update(`${userId}.${expiresAt}.${tokenVersion}`).digest("base64url");

  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return { userId, tokenVersion, valid: false };
    const valid = timingSafeEqual(sigBuf, expBuf);
    return { userId, tokenVersion, valid };
  } catch {
    return { userId, tokenVersion, valid: false };
  }
}

/** Express middleware — reads Authorization header, attaches req.authenticatedUserId.
 *  Does NOT reject the request — use requireAuth() for that.
 *
 *  Async: after a signature/expiry-valid token is found, checks the
 *  token's embedded tokenVersion against the user's current token_version
 *  in the database. A mismatch means the token was revoked (logout or
 *  password change since it was issued) — req.authenticatedUserId is left
 *  unset, so requireAuth() downstream correctly rejects with 401. */
export async function parseAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const { userId, tokenVersion, valid } = verifyToken(token);
    if (valid) {
      try {
        const [user] = await db.select({ token_version: usersTable.token_version })
          .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        if (user && user.token_version === tokenVersion) {
          req.authenticatedUserId = userId;
        }
      } catch (err) {
        logger.error({ err, userId }, "parseAuth: token_version lookup failed");
      }
    }
  }
  next();
}

/** Express middleware — rejects with 401 if no valid Bearer token. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authenticatedUserId) {
    res.status(401).json({ error: "Unauthorized — valid Bearer token required" });
    return;
  }
  next();
}

/** Returns true only when the authenticated user IS the target user. */
export function isSelf(req: Request, targetUserId: number): boolean {
  return req.authenticatedUserId === targetUserId;
}
