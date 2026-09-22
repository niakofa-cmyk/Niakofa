/**
 * HIGH-002: shared-secret token verification, mirroring the pure
 * (non-DB) half of artifacts/api-server/src/middlewares/auth.ts's
 * verifyToken. nia-service has no DB access to the users table, so it
 * cannot check token_version revocation — only signature + expiry. That's
 * an accepted tradeoff: a token revoked via logout/password-change stays
 * valid against Nia until its normal 30-day expiry, but it can no longer
 * be forged, and the client can no longer impersonate an arbitrary userId.
 *
 * SESSION_SECRET must be the exact same value configured on api-server.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error(
    "FATAL: SESSION_SECRET environment variable is not set on nia-service. " +
    "It must match the SESSION_SECRET configured on api-server — copy the " +
    "same value into Railway → nia-service → Variables."
  );
}

const SECRET: string = SESSION_SECRET;

export function verifyToken(token: string): { userId: number; valid: boolean } {
  const parts = token.split(".");
  if (parts.length !== 4) return { userId: 0, valid: false };

  const [userIdRaw, expiresAtRaw, tokenVersionRaw, sig] = parts;
  const userId = parseInt(userIdRaw, 10);
  const expiresAt = parseInt(expiresAtRaw, 10);
  const tokenVersion = parseInt(tokenVersionRaw, 10);
  if (isNaN(userId) || userId <= 0 || isNaN(expiresAt) || isNaN(tokenVersion) || !sig) {
    return { userId: 0, valid: false };
  }

  if (Date.now() > expiresAt) return { userId, valid: false };

  const expected = createHmac("sha256", SECRET).update(`${userId}.${expiresAt}.${tokenVersion}`).digest("base64url");

  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return { userId, valid: false };
    return { userId, valid: timingSafeEqual(sigBuf, expBuf) };
  } catch {
    return { userId, valid: false };
  }
}

/**
 * Parses the Authorization header if present and attaches
 * req.authenticatedUserId on success. Never rejects the request — Nia
 * supports anonymous chat, so this only upgrades anonymous → identified
 * when a valid token is provided.
 */
export function parseOptionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const { userId, valid } = verifyToken(token);
    if (valid) {
      req.authenticatedUserId = userId;
    }
  }
  next();
}
