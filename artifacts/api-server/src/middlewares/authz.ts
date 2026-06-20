import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Ensure the global Express.Request type extension is loaded
import "../types/express.d";

/**
 * Ownership guard — ensures the authenticated user matches the target resource ID.
 *
 * Checks route params first (e.g. /users/:id), then falls back to the request body
 * (e.g. a POST where the owner ID is in the payload).
 */
export function requireOwnership(paramName: string = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const authenticatedUserId = req.authenticatedUserId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let targetId: number | undefined;

    // Check params first
    if (req.params[paramName]) {
      targetId = parseInt(req.params[paramName] as string);
    }

    // If not in params, check body (e.g. for SOS or pledge)
    if (targetId === undefined && req.body[paramName]) {
      targetId = parseInt(req.body[paramName]);
    }

    if (isNaN(targetId as number) || authenticatedUserId !== targetId) {
      return res.status(403).json({ error: "Forbidden: You can only access your own resources" });
    }

    return next();
  };
}

/**
 * Admin guard — checks the `is_admin` flag on the authenticated user's DB row.
 *
 * Uses Role-Based Access Control (RBAC) via the `is_admin` column on `usersTable`,
 * replacing the previous hardcoded user-ID check. Set `is_admin = true` on any
 * user row to grant admin access without a redeploy.
 */
export function requireAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedUserId = req.authenticatedUserId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [user] = await db
      .select({ is_admin: usersTable.is_admin })
      .from(usersTable)
      .where(eq(usersTable.id, authenticatedUserId))
      .limit(1);

    if (!user?.is_admin) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    return next();
  };
}


/**
 * Approval guard — blocks any account (individual, business, or sponsor)
 * that hasn't been approved by an admin yet. Admins always bypass this,
 * since they're the ones doing the approving.
 *
 * Intended to be mounted globally in app.ts, not per-route, since the
 * product requirement is "fully locked out until approved" across the
 * entire API surface (with an explicit exemption list for login/register/
 * health/webhooks).
 */
export async function requireApproved(req: Request, res: Response, next: NextFunction) {
  const authenticatedUserId = req.authenticatedUserId;
  if (!authenticatedUserId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const [user] = await db
    .select({ approval_status: usersTable.approval_status, is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, authenticatedUserId))
    .limit(1);

  if (!user) {
    return res.status(401).json({ error: "Account not found" });
  }

  if (user.is_admin) return next(); // admins bypass — they manage approvals themselves

  if (user.approval_status !== "approved") {
    return res.status(403).json({
      error: "Account pending admin approval",
      approval_status: user.approval_status,
    });
  }

  return next();
}
