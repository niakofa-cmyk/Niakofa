import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";

/**
 * Stamps the server receipt time of a successful GPS write before the response
 * is sent. This keeps Diaspora freshness authoritative and prevents a slow
 * asynchronous post-response write from racing the next presence read.
 */
export const stampLocationUpdatedAt: RequestHandler = (req, res, next) => {
  if (req.method !== "PATCH" || !/^\/users\/\d+\/location(?:\?|$)/.test(req.url)) {
    return next();
  }

  const match = req.url.match(/^\/users\/(\d+)\/location(?:\?|$)/);
  const userId = Number(match?.[1]);
  if (!Number.isInteger(userId) || userId <= 0) return next();

  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode < 200 || res.statusCode >= 300) return sendJson(body);

    const locationUpdatedAt = new Date();
    void db.update(usersTable)
      .set({ location_updated_at: locationUpdatedAt })
      .where(eq(usersTable.id, userId))
      .then(() => {
        if (body && typeof body === "object" && !Array.isArray(body)) {
          sendJson({ ...(body as Record<string, unknown>), location_updated_at: locationUpdatedAt.toISOString() });
        } else {
          sendJson(body);
        }
      })
      .catch((error) => {
        console.warn("location_updated_at stamp failed", { userId, error });
        sendJson(body);
      });

    return res;
  }) as typeof res.json;

  next();
};
