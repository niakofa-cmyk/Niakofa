import { Request, Response, NextFunction } from "express";

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

    // If not in params, check body (e.g., for SOS or pledge)
    if (targetId === undefined && req.body[paramName]) {
      targetId = parseInt(req.body[paramName]);
    }

    if (isNaN(targetId as number) || authenticatedUserId !== targetId) {
      return res.status(403).json({ error: "Forbidden: You can only access your own resources" });
    }

    next();
  };
}

export function requireAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    const authenticatedUserId = (req as any).authenticatedUserId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    // For now, let's assume user ID 1 is an admin. In a real app, this would check a role in the DB.
    if (authenticatedUserId !== 1) { 
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }
    next();
  };
}
