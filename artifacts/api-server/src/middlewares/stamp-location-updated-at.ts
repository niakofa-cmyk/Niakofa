import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";

/** Records the server receipt time of a successful GPS fix. */
export const stampLocationUpdatedAt: RequestHandler = (req, res, next) => {
  if (req.method !== "PATCH" || !/^\/users\/\d+\/location(?:\?|$)/.test(req.url)) return next();

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const userId = Number(req.url.match(/^\/users\/(\d+)\/location(?:\?|$)/)?.[1]);
    if (!Number.isInteger(userId) || userId <= 0) return;
    void db.update(usersTable)
      .set({ location_updated_at: new Date() })
      .where(eq(usersTable.id, userId))
      .catch((error) => console.warn("location_updated_at stamp failed", { userId, error }));
  });

  next();
};
