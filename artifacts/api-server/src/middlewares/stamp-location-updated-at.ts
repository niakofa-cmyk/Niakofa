import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";

/**
 * Safety-net stamp for the server receipt time of a GPS write.
 *
 * The canonical `/users/:id/location` handler now sets location_updated_at
 * in the same statement as lat/lng, so freshness and position always land
 * atomically and this middleware has nothing to do on the happy path. It
 * stays in place only to backfill the column for any older/alternate
 * location-writing route that responds without having stamped it itself —
 * detected by the field being absent from the outgoing JSON body — rather
 * than unconditionally re-writing it after every request, which used to
 * cost a second round trip and a brief window where a presence read could
 * see a fresh position next to a stale location_updated_at.
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
    const alreadyStamped =
      res.statusCode < 200 ||
      res.statusCode >= 300 ||
      (body && typeof body === "object" && !Array.isArray(body) && "location_updated_at" in body);
    if (alreadyStamped) return sendJson(body);

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
