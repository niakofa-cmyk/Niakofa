import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * HMAC-SHA256 stateless auth tokens.
 *
 * Token format: "<userId>.<expiresAt>.<tokenVersion>.<base64url(hmac-sha256(...))>"
 *
 * ALIGNED WITH NIA-SERVICE (fixed 2026-06-30): this used to be a bare
 * "<userId>.<sig>" token. nia-service/src/lib/auth.ts was written expecting
 * this exact 4-part format from day one — its own comment assumed a 30-day
 * expiry existed — but api-server never actually issued one. Since
 * nia-proxy forwards the client's real Authorization header straight to
 * nia-service, nia-service's verifyToken (correctly, given its own contract)
 * rejected every real token outright, so nia-service treated every logged-in
 * user as anonymous. This format now matches nia-service's parser exactly;
 * nia-service required no changes.
 *
 * tokenVersion is carried in the token but — same deliberate tradeoff as
 * before — is NOT checked against the DB by this stateless verifyToken (that
 * would require a DB lookup on every authenticated request). It's there so a
 * future opt-in check (e.g. inside requireApproved, which already does a
 * per-request DB lookup) can start enforcing "logout everywhere" /
 * password-change revocation without another format migration.
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
    "and add it to Railway → Variables. This EXACT value must also be set as " +
    "SESSION_SECRET on the nia-service Railway variables — both services " +
    "verify the same tokens."
  );
}

// From this point SESSION_SECRET is guaranteed to be a non-empty string.
const SECRET: string = SESSION_SECRET;

// 30 days — matches the expiry nia-service's auth module has always assumed.
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sign a token for userId, embedding a 30-day expiry and the user's current
 * token_version (pass the value from the row you just selected/updated —
 * every call site already has it on hand). This is the only signing
 * function. The former signToken(userId, email) that signed a different
 * payload than verifyToken expected has been removed — it was dead code
 * that would have silently produced unverifiable tokens.
 */
export function signTokenById(userId: number, tokenVersion: number = 0): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const sig = createHmac("sha256", SECRET)
    .update(`${userId}.${expiresAt}.${tokenVersion}`)
    .digest("base64url");
  return `${userId}.${expiresAt}.${tokenVersion}.${sig}`;
}

/** Verify a token produced by signTokenById. */
export function verifyToken(token: string): { userId: number; valid: boolean; tokenVersion?: number } {
  const parts = token.split(".");
  if (parts.length !== 4) return { userId: 0, valid: false };

  const [userIdRaw, expiresAtRaw, tokenVersionRaw, sig] = parts;
  const userId = parseInt(userIdRaw, 10);
  const expiresAt = parseInt(expiresAtRaw, 10);
  const tokenVersion = parseInt(tokenVersionRaw, 10);
  if (isNaN(userId) || userId <= 0 || isNaN(expiresAt) || isNaN(tokenVersion) || !sig) {
    return { userId: 0, valid: false };
  }

  if (Date.now() > expiresAt) return { userId, valid: false, tokenVersion };

  const expected = createHmac("sha256", SECRET)
    .update(`${userId}.${expiresAt}.${tokenVersion}`)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return { userId, valid: false, tokenVersion };
    const valid = timingSafeEqual(sigBuf, expBuf);
    return { userId, valid, tokenVersion };
  } catch {
    return { userId, valid: false, tokenVersion };
  }
}

/** Express middleware — reads Authorization header, attaches req.authenticatedUserId.
 *  Does NOT reject the request — use requireAuth() for that. */
export function parseAuth(req: Request, _res: Response, next: NextFunction): void {
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

/** Express middleware — rejects with 401 if no valid Bearer token. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authenticatedUserId) {
    res.status(401).json({ error: "Unauthorized — valid Bearer token required" });
    return;
  }
  next();
}

/** Express middleware — rejects with 403 if user account is suspended, banned,
 *  or not yet approved (approval_status !== "approved"). Must run after requireAuth. */
export async function requireApproved(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authenticatedUserId) {
    res.status(401).json({ error: "Unauthorized — valid Bearer token required" });
    return;
  }
  const [user] = await db
    .select({
      is_suspended: usersTable.is_suspended,
      trust_score: usersTable.trust_score,
      approval_status: usersTable.approval_status,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.authenticatedUserId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (user.is_suspended) {
    res.status(403).json({ error: "Account suspended — contact support" });
    return;
  }
  if (user.trust_score !== null && user.trust_score <= -1) {
    res.status(403).json({ error: "Account banned — contact support" });
    return;
  }
  if (user.approval_status !== "approved") {
    res.status(403).json({ error: "Account pending approval", approval_status: user.approval_status ?? "pending" });
    return;
  }
  next();
}

/** Returns true only when the authenticated user IS the target user. */
export function isSelf(req: Request, targetUserId: number): boolean {
  return req.authenticatedUserId === targetUserId;
}
