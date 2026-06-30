import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * HMAC-SHA256 stateless auth tokens.
 *
 * Token format: "<userId>.<base64url(hmac-sha256(userId, SESSION_SECRET))>"
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

/**
 * Sign a token using userId only (stateless — no DB lookup required to verify).
 * This is the only signing function. The former signToken(userId, email) that
 * signed a different payload than verifyToken expected has been removed —
 * it was dead code that would have silently produced unverifiable tokens.
 */
export function signTokenById(userId: number): string {
  const sig = createHmac("sha256", SECRET).update(String(userId)).digest("base64url");
  return `${userId}.${sig}`;
}

/** Verify a token produced by signTokenById. */
export function verifyToken(token: string): { userId: number; valid: boolean } {
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return { userId: 0, valid: false };

  const userId = parseInt(token.slice(0, dotIdx), 10);
  if (isNaN(userId) || userId <= 0) return { userId: 0, valid: false };

  const sig = token.slice(dotIdx + 1);
  if (!sig) return { userId: 0, valid: false };

  const expected = createHmac("sha256", SECRET).update(String(userId)).digest("base64url");

  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return { userId, valid: false };
    const valid = timingSafeEqual(sigBuf, expBuf);
    return { userId, valid };
  } catch {
    return { userId, valid: false };
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

/** Express middleware — rejects with 403 if user account is suspended or banned. */
export async function requireApproved(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authenticatedUserId) {
    res.status(401).json({ error: "Unauthorized — valid Bearer token required" });
    return;
  }
  const [user] = await db
    .select({ is_suspended: usersTable.is_suspended, trust_score: usersTable.trust_score })
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
  next();
}

/** Returns true only when the authenticated user IS the target user. */
export function isSelf(req: Request, targetUserId: number): boolean {
  return req.authenticatedUserId === targetUserId;
}
