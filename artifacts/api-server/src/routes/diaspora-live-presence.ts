import { Router } from "express";
import { and, gte, isNotNull } from "drizzle-orm";
import { db, usersTable, diasporaHubsTable, cityNeighborhoodsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { buildPresenceSnapshot, LIVE_PRESENCE_WINDOW_MS, resolveNearestHub } from "../lib/diasporaPresence";
import { evaluateNeighborhoodGeofence } from "../lib/neighborhoodGeofence";

const router = Router();

function cityKeyFromHubName(name: string): string {
  return name
    .split(",")[0]!
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Authenticated, aggregate-only physical presence for the Diaspora Globe.
 *
 * `member_count` remains a membership metric. `live_user_count` is recent
 * GPS-derived presence. Neighborhood counts are only marked GPS-verified when
 * an effective, admin-verified neighborhood geometry contains the user's fix.
 */
router.get("/griot/live-presence", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const now = new Date();
    const currentUserId = req.authenticatedUserId!;

    const [hubs, users, neighborhoods] = await Promise.all([
      db.select({
        id: diasporaHubsTable.id,
        name: diasporaHubsTable.name,
        lat: diasporaHubsTable.lat,
        lng: diasporaHubsTable.lng,
        presence_radius_km: diasporaHubsTable.presence_radius_km,
        status: diasporaHubsTable.status,
      }).from(diasporaHubsTable),
      db.select({
        id: usersTable.id,
        lat: usersTable.lat,
        lng: usersTable.lng,
        location_updated_at: usersTable.location_updated_at,
      })
        .from(usersTable)
        .where(and(
          isNotNull(usersTable.location_updated_at),
          gte(usersTable.location_updated_at, new Date(now.getTime() - LIVE_PRESENCE_WINDOW_MS)),
        )),
      db.select({
        id: cityNeighborhoodsTable.id,
        city_key: cityNeighborhoodsTable.city_key,
        neighborhood_id: cityNeighborhoodsTable.neighborhood_id,
        name: cityNeighborhoodsTable.name,
        emoji: cityNeighborhoodsTable.emoji,
        center_lat: cityNeighborhoodsTable.center_lat,
        center_lng: cityNeighborhoodsTable.center_lng,
        radius_meters: cityNeighborhoodsTable.radius_meters,
        polygon_geojson: cityNeighborhoodsTable.polygon_geojson,
        geometry_verified: cityNeighborhoodsTable.geometry_verified,
        geometry_effective_at: cityNeighborhoodsTable.geometry_effective_at,
      }).from(cityNeighborhoodsTable),
    ]);

    const snapshot = buildPresenceSnapshot({ now, hubs, users, currentUserId });
    const approvedHubs = hubs.filter((hub) => hub.status === "approved");
    const neighborhoodCounts = new Map<number, number>();

    for (const user of users) {
      if (user.lat == null || user.lng == null) continue;
      const hub = resolveNearestHub(user.lat, user.lng, approvedHubs);
      if (!hub) continue;
      const cityKey = cityKeyFromHubName(hub.hub_name);
      for (const neighborhood of neighborhoods) {
        if (neighborhood.city_key !== cityKey || !neighborhood.geometry_verified) continue;
        const result = evaluateNeighborhoodGeofence(user.lat, user.lng, neighborhood, now);
        if (result.status === "inside") {
          neighborhoodCounts.set(neighborhood.id, (neighborhoodCounts.get(neighborhood.id) ?? 0) + 1);
          break;
        }
      }
    }

    res.json({
      ...snapshot,
      neighborhoods: neighborhoods
        .filter((n) => n.geometry_verified)
        .map((n) => ({
          neighborhood_id: n.neighborhood_id,
          name: n.name,
          emoji: n.emoji,
          live_user_count: neighborhoodCounts.get(n.id) ?? 0,
          gps_verified: true,
          geometry_effective_at: n.geometry_effective_at?.toISOString?.() ?? n.geometry_effective_at ?? null,
        })),
    });
  } catch (error) {
    logger.error({ error }, "griot: live presence query failed");
    res.status(503).json({ error: "Live Diaspora presence is temporarily unavailable." });
  }
});

export default router;
