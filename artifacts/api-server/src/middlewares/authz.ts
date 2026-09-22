import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Ensure the global Express.Request type extension is loaded
import "../types/express.d";

/**
 * Resolves the literal string "me" in a route :id param to the authenticated
 * user's numeric ID.  Must run AFTER requireAuth (which populates
 * req.authenticatedUserId).  Apply to any route that should accept both
 * /users/42/... and /users/me/... forms.
 *
 * Usage:  router.get("/users/:id", requireAuth, resolveMeParam, ...)
 */
export function resolveMeParam(req: Request, _res: Response, next: NextFunction): void {
  if (req.params.id === "me" && req.authenticatedUserId) {
    req.params.id = String(req.authenticatedUserId);
  }
  next();
}

/**
 * Ownership guard — ensures the authenticated user matches the target resource ID.
 *
 * Checks route params first (e.g. /users/:id), then falls back to the request body
 * (e.g. a POST where the owner ID is in the payload).
 * Treats the literal value "me" as the authenticated user's ID so routes can
 * accept both /users/42/... and /users/me/... without duplicating handlers.
 */
export function requireOwnership(paramName: string = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const authenticatedUserId = req.authenticatedUserId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let targetId: number | undefined;

    // Check params first — treat the special value "me" as the authenticated
    // user so routes like PATCH /users/me/helper-mode and GET /users/me work
    // without the client needing to know their own numeric ID.
    if (req.params[paramName]) {
      const raw = req.params[paramName] as string;
      targetId = raw === "me" ? authenticatedUserId : parseInt(raw);
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
