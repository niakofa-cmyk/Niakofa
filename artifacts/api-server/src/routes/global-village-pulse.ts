import { Router } from "express";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db, usersTable, diasporaHubsTable, cityNeighborhoodsTable, griotStoriesTable, requestsTable, communityPoolLedgerTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { buildPresenceSnapshot, LIVE_PRESENCE_WINDOW_MS } from "../lib/diasporaPresence";
import { evaluateNeighborhoodGeofence } from "../lib/neighborhoodGeofence";

const router = Router();

/** Authenticated aggregate pulse. Raw GPS coordinates never leave the server. */
router.get("/griot/village-pulse", requireAuth, generalApiLimiter, async (req, res) => {
  const now = new Date();
  const currentUserId = req.authenticatedUserId!;
  try {
    const [hubs, users, neighborhoods, currentRows] = await Promise.all([
      db.select().from(diasporaHubsTable),
      db.select({ id: usersTable.id, lat: usersTable.lat, lng: usersTable.lng, location_updated_at: usersTable.location_updated_at })
        .from(usersTable).where(and(isNotNull(usersTable.location_updated_at), gte(usersTable.location_updated_at, new Date(now.getTime() - LIVE_PRESENCE_WINDOW_MS)), lte(usersTable.location_updated_at, now))),
      db.select({ id: cityNeighborhoodsTable.id, city_key: cityNeighborhoodsTable.city_key, neighborhood_id: cityNeighborhoodsTable.neighborhood_id, name: cityNeighborhoodsTable.name, emoji: cityNeighborhoodsTable.emoji, center_lat: cityNeighborhoodsTable.center_lat, center_lng: cityNeighborhoodsTable.center_lng, radius_meters: cityNeighborhoodsTable.radius_meters, polygon_geojson: cityNeighborhoodsTable.polygon_geojson, geometry_verified: cityNeighborhoodsTable.geometry_verified, geometry_effective_at: cityNeighborhoodsTable.geometry_effective_at }).from(cityNeighborhoodsTable),
      db.select({ id: usersTable.id, lat: usersTable.lat, lng: usersTable.lng, location_updated_at: usersTable.location_updated_at }).from(usersTable).where(eq(usersTable.id, currentUserId)).limit(1),
    ]);

    const presence = buildPresenceSnapshot({ now, hubs, users, currentUserId });
    const liveUsersByNeighborhood = new Map<number, number>();

    // Reviewed neighborhood geometry is authoritative for neighborhood tallies;
    // hub radius must not suppress a live neighborhood at its edge.
    for (const user of users) {
      if (user.lat == null || user.lng == null) continue;
      for (const neighborhood of neighborhoods) {
        if (!neighborhood.geometry_verified) continue;
        if (evaluateNeighborhoodGeofence(user.lat, user.lng, neighborhood, now).status === "inside") {
          liveUsersByNeighborhood.set(neighborhood.id, (liveUsersByNeighborhood.get(neighborhood.id) ?? 0) + 1);
          break;
        }
      }
    }

    const current = currentRows[0];
    const currentAgeMs = current?.location_updated_at ? now.getTime() - new Date(current.location_updated_at).getTime() : null;
    let currentNeighborhood: { neighborhood_id: string; name: string; emoji: string | null; live_user_count: number; gps_verified: true } | null = null;
    if (current && current.lat != null && current.lng != null && currentAgeMs != null && currentAgeMs >= 0 && currentAgeMs <= LIVE_PRESENCE_WINDOW_MS) {
      for (const neighborhood of neighborhoods) {
        if (!neighborhood.geometry_verified) continue;
        if (evaluateNeighborhoodGeofence(current.lat, current.lng, neighborhood, now).status === "inside") {
          currentNeighborhood = { neighborhood_id: neighborhood.neighborhood_id, name: neighborhood.name, emoji: neighborhood.emoji, live_user_count: liveUsersByNeighborhood.get(neighborhood.id) ?? 0, gps_verified: true };
          break;
        }
      }
    }

    const approvedHubs = hubs.filter((hub) => hub.status === "approved");
    const enriched = await Promise.all(approvedHubs.map(async (hub) => {
      const [memberRow, storyRow, openRequestRow, fulfilledRow, poolRow] = await Promise.all([
        db.execute<{ count: number }>(sql`SELECT COUNT(DISTINCT u.id)::int AS count FROM users u WHERE ${hub.community_id != null ? sql`u.community_id = ${hub.community_id} OR EXISTS (SELECT 1 FROM hub_community_leaders hcl WHERE hcl.hub_id = ${hub.id} AND hcl.user_id = u.id)` : sql`EXISTS (SELECT 1 FROM hub_community_leaders hcl WHERE hcl.hub_id = ${hub.id} AND hcl.user_id = u.id)`}`),
        db.select({ count: sql<number>`COUNT(*)::int` }).from(griotStoriesTable).where(and(eq(griotStoriesTable.hub_id, hub.id), eq(griotStoriesTable.status, "published"), eq(griotStoriesTable.visibility, "public"))),
        db.select({ count: sql<number>`COUNT(*)::int` }).from(requestsTable).where(and(eq(requestsTable.hub_id, hub.id), eq(requestsTable.status, "open"))),
        hub.community_id != null ? db.select({ count: sql<number>`COUNT(*)::int` }).from(requestsTable).where(sql`${requestsTable.status} = 'completed' AND ${requestsTable.requester_id} IN (SELECT id FROM users WHERE community_id = ${hub.community_id})`) : Promise.resolve([{ count: 0 }]),
        hub.community_id != null ? db.select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` }).from(communityPoolLedgerTable).where(eq(communityPoolLedgerTable.community_id, hub.community_id)) : Promise.resolve([{ balance: 0 }]),
      ]);
      let activeHelpers = 0;
      if (hub.community_id != null) {
        const [helperRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(usersTable).where(and(eq(usersTable.community_id, hub.community_id), eq(usersTable.helper_mode_active, true)));
        activeHelpers = helperRow?.count ?? 0;
      }
      const live = presence.hubs.find((item) => item.hub_id === hub.id);
      return { id: hub.id, name: hub.name, member_count: Number(memberRow.rows[0]?.count ?? 0), live_user_count: live?.live_user_count ?? 0, story_count: storyRow[0]?.count ?? 0, open_requests: openRequestRow[0]?.count ?? 0, activity: { active_helpers: activeHelpers, requests_fulfilled: fulfilledRow[0]?.count ?? 0, pool_balance: Number(poolRow[0]?.balance ?? 0) } };
    }));

    const activeNeighborhoods = [...liveUsersByNeighborhood.values()].filter((count) => count > 0).length;
    const totals = enriched.reduce((acc, hub) => ({
      members: acc.members + hub.member_count, live: acc.live + hub.live_user_count, stories: acc.stories + hub.story_count,
      active_helpers: acc.active_helpers + hub.activity.active_helpers, open_requests: acc.open_requests + hub.open_requests,
      requests_fulfilled: acc.requests_fulfilled + hub.activity.requests_fulfilled, pool_balance: acc.pool_balance + hub.activity.pool_balance,
    }), { members: 0, live: 0, stories: 0, active_helpers: 0, open_requests: 0, requests_fulfilled: 0, pool_balance: 0 });

    // This endpoint is user-specific aggregate state, so never allow an
    // intermediary/browser cache to replay one member's village snapshot to another.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization, Cookie");
    res.setHeader("X-Niakofa-Village-Pulse", "verified");
    res.json({
      generated_at: presence.generated_at,
      freshness_window_seconds: presence.freshness_window_seconds,
      current_user: { ...presence.current_user, current_neighborhood: currentNeighborhood },
      totals: { ...totals, active_neighborhoods: activeNeighborhoods },
      hubs: enriched,
      neighborhoods: neighborhoods.filter((n) => n.geometry_verified).map((n) => ({ neighborhood_id: n.neighborhood_id, name: n.name, emoji: n.emoji, live_user_count: liveUsersByNeighborhood.get(n.id) ?? 0, gps_verified: true, geometry_effective_at: n.geometry_effective_at?.toISOString?.() ?? n.geometry_effective_at ?? null })),
    });
  } catch {
    res.status(503).json({ error: "Global Village pulse is temporarily unavailable." });
  }
});

export default router;
