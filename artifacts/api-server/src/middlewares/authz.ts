import { Request, Response, NextFunction } from "express";

/**
 * Ownership guard — ensures the authenticated user matches the target resource ID.
 *
 * Checks route params first (e.g. /users/:id), then falls back to the request body
 * (e.g. a POST where the owner ID is in the payload).
 */
export function requireOwnership(paramName: string = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const authenticatedUserId = (req as any).authenticatedUserId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let targetId: number | undefined;

    // Check params first
    if (req.params[paramName]) {
      targetId = parseInt(req.params[paramName]);
    }

    // If not in params, check body (e.g. for SOS or pledge)
    if (targetId === undefined && req.body[paramName]) {
      targetId = parseInt(req.body[paramName]);
    }

    if (isNaN(targetId as number) || authenticatedUserId !== targetId) {
      return res.status(403).json({ error: "Forbidden: You can only access your own resources" });
    }

    next();
  };
}

/**
 * Admin guard — only allows the designated admin user through.
 *
 * NOTE: Admin status is currently determined by a hardcoded user ID (1).
 * This should be migrated to a role/flag column in the users table when
 * the team is ready to support multiple admins.
 */
export function requireAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    const authenticatedUserId = (req as any).authenticatedUserId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (authenticatedUserId !== 1) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }
    next();
  };
}
