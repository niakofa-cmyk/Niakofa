import { Router } from "express";
import { and, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { db, usersTable, diasporaHubsTable, cityNeighborhoodsTable, audioCirclesTable, griotStoriesTable, requestsTable, communityPoolLedgerTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { buildPresenceSnapshot, LIVE_PRESENCE_WINDOW_MS, resolveNearestHub } from "../lib/diasporaPresence";
import {
  evaluateNeighborhoodGeofence,
  getNeighborhoodGeometryStatus,
  isActiveNeighborhood,
} from "../lib/neighborhoodGeofence";
import { isCanonicalGlobeHub, mergeHubsForGlobeDisplay } from "../lib/diasporaHubMerge";

const router = Router();

function normalizedCityKey(value: string): string {
  return value
    .split(",")[0]!
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Authenticated aggregate pulse. Raw GPS coordinates never leave the server. */
router.get("/griot/village-pulse", requireAuth, generalApiLimiter, async (req, res) => {
  const now = new Date();
  const currentUserId = req.authenticatedUserId!;
  try {
    const [hubs, users, neighborhoodRows, currentRows, circles, leaderRows, uniqueMembers, uniqueOpenRequests, uniqueFulfilledRequests, uniquePool] = await Promise.all([
      db.select().from(diasporaHubsTable),
      db.select({ id: usersTable.id, lat: usersTable.lat, lng: usersTable.lng, location_updated_at: usersTable.location_updated_at, helper_mode_active: usersTable.helper_mode_active, community_id: usersTable.community_id })
        .from(usersTable).where(and(isNotNull(usersTable.location_updated_at), gte(usersTable.location_updated_at, new Date(now.getTime() - LIVE_PRESENCE_WINDOW_MS)), lte(usersTable.location_updated_at, now))),
      db.select({ id: cityNeighborhoodsTable.id, city_key: cityNeighborhoodsTable.city_key, neighborhood_id: cityNeighborhoodsTable.neighborhood_id, name: cityNeighborhoodsTable.name, emoji: cityNeighborhoodsTable.emoji, center_lat: cityNeighborhoodsTable.center_lat, center_lng: cityNeighborhoodsTable.center_lng, radius_meters: cityNeighborhoodsTable.radius_meters, polygon_geojson: cityNeighborhoodsTable.polygon_geojson, geometry_verified: cityNeighborhoodsTable.geometry_verified, geometry_effective_at: cityNeighborhoodsTable.geometry_effective_at, verified: cityNeighborhoodsTable.verified, source_kind: cityNeighborhoodsTable.source_kind, authority_level: cityNeighborhoodsTable.authority_level }).from(cityNeighborhoodsTable),
      db.select({ id: usersTable.id, lat: usersTable.lat, lng: usersTable.lng, location_updated_at: usersTable.location_updated_at }).from(usersTable).where(eq(usersTable.id, currentUserId)).limit(1),
      db.select({ id: audioCirclesTable.id, city_key: audioCirclesTable.city_key, neighborhood_id: audioCirclesTable.neighborhood_id }).from(audioCirclesTable),
      db.execute<{ hub_id: number; user_id: number }>(sql`
        SELECT hcl.hub_id, hcl.user_id
        FROM hub_community_leaders hcl
        JOIN diaspora_hubs h ON h.id = hcl.hub_id
        WHERE h.status = 'approved'
      `),
      db.execute<{ user_id: number }>(sql`
        SELECT DISTINCT member.user_id
        FROM (
          SELECT u.id AS user_id
          FROM users u
          JOIN diaspora_hubs h ON h.community_id = u.community_id
          WHERE h.status = 'approved' AND h.community_id IS NOT NULL
          UNION
          SELECT hcl.user_id
          FROM hub_community_leaders hcl
          JOIN diaspora_hubs h ON h.id = hcl.hub_id
          WHERE h.status = 'approved'
        ) member
      `),
      db.execute<{ id: number }>(sql`
        SELECT DISTINCT r.id
        FROM help_requests r
        LEFT JOIN diaspora_hubs direct_hub
          ON direct_hub.id = r.hub_id AND direct_hub.status = 'approved'
        LEFT JOIN users requester ON requester.id = r.requester_id
        LEFT JOIN diaspora_hubs community_hub
          ON community_hub.community_id = requester.community_id
          AND community_hub.status = 'approved'
        WHERE r.status = 'open' AND (direct_hub.id IS NOT NULL OR community_hub.id IS NOT NULL)
      `),
      db.execute<{ id: number }>(sql`
        SELECT DISTINCT r.id
        FROM help_requests r
        LEFT JOIN diaspora_hubs direct_hub
          ON direct_hub.id = r.hub_id AND direct_hub.status = 'approved'
        LEFT JOIN users requester ON requester.id = r.requester_id
        LEFT JOIN diaspora_hubs community_hub
          ON community_hub.community_id = requester.community_id
          AND community_hub.status = 'approved'
        WHERE r.status = 'completed' AND (direct_hub.id IS NOT NULL OR community_hub.id IS NOT NULL)
      `),
      db.execute<{ balance: number }>(sql`
        SELECT COALESCE(SUM(cpl.amount), 0)::float8 AS balance
        FROM community_pool_ledger cpl
        WHERE cpl.community_id IN (
          SELECT DISTINCT community_id
          FROM diaspora_hubs
          WHERE status = 'approved' AND community_id IS NOT NULL
        )
      `),
    ]);
    const neighborhoods = neighborhoodRows.filter((neighborhood) => isActiveNeighborhood(neighborhood, now));

    const presence = buildPresenceSnapshot({ now, hubs, users, currentUserId });
    const approvedHubs = hubs.filter((hub) => hub.status === "approved");
    const leadersByHub = new Map<number, Set<number>>();
    for (const row of leaderRows.rows) {
      const leaders = leadersByHub.get(row.hub_id) ?? new Set<number>();
      leaders.add(row.user_id);
      leadersByHub.set(row.hub_id, leaders);
    }
    const liveHelpersByHub = new Map<number, Set<number>>();
    for (const user of users) {
      if (user.helper_mode_active !== true || user.lat == null || user.lng == null) continue;
      const resolvedHub = resolveNearestHub(user.lat, user.lng, approvedHubs);
      if (!resolvedHub) continue;
      const hub = approvedHubs.find((candidate) => candidate.id === resolvedHub.hub_id);
      if (!hub) continue;
      const isCommunityMember = hub.community_id != null && user.community_id === hub.community_id;
      const isHubLeader = leadersByHub.get(hub.id)?.has(user.id) ?? false;
      if (!isCommunityMember && !isHubLeader) continue;
      const helpers = liveHelpersByHub.get(hub.id) ?? new Set<number>();
      helpers.add(user.id);
      liveHelpersByHub.set(hub.id, helpers);
    }
    const liveUsersByNeighborhood = new Map<number, number>();
    const activeNeighborhoodIds = new Set(neighborhoods.map((neighborhood) => neighborhood.id));
    const spiralIdByNeighborhoodId = new Map(circles
      .filter((circle): circle is { id: number; city_key: string; neighborhood_id: number } =>
        circle.neighborhood_id != null && activeNeighborhoodIds.has(circle.neighborhood_id))
      .map((circle) => [circle.neighborhood_id, circle.id]));

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
    let currentNeighborhood: { neighborhood_id: string; name: string; emoji: string | null; circle_id: number | null; live_user_count: number; gps_verified: true } | null = null;
    if (current && current.lat != null && current.lng != null && currentAgeMs != null && currentAgeMs >= 0 && currentAgeMs <= LIVE_PRESENCE_WINDOW_MS) {
      for (const neighborhood of neighborhoods) {
        if (!neighborhood.geometry_verified) continue;
        if (evaluateNeighborhoodGeofence(current.lat, current.lng, neighborhood, now).status === "inside") {
          currentNeighborhood = { neighborhood_id: neighborhood.neighborhood_id, name: neighborhood.name, emoji: neighborhood.emoji, circle_id: spiralIdByNeighborhoodId.get(neighborhood.id) ?? null, live_user_count: liveUsersByNeighborhood.get(neighborhood.id) ?? 0, gps_verified: true };
          break;
        }
      }
    }
    const locationVerification =
      currentNeighborhood
        ? "gps_verified_neighborhood"
        : presence.current_user.location_fresh
          ? presence.current_user.current_hub
            ? "gps_verified_hub"
            : "gps_fresh_no_reviewed_neighborhood"
          : "stale_or_missing_gps";

    const enriched = await Promise.all(approvedHubs.map(async (hub) => {
      const hubCityKey = normalizedCityKey(hub.name);
      const neighborhood_count = neighborhoods.filter((neighborhood) =>
        normalizedCityKey(neighborhood.city_key) === hubCityKey &&
        getNeighborhoodGeometryStatus(neighborhood, now) === "verified"
      ).length;
      const spiral_count = circles.filter((circle) =>
        normalizedCityKey(circle.city_key) === hubCityKey
      ).length;
      const [memberRow, storyRow, openRequestRow, fulfilledRow, poolRow] = await Promise.all([
        db.execute<{ count: number }>(sql`SELECT COUNT(DISTINCT u.id)::int AS count FROM users u WHERE ${hub.community_id != null ? sql`u.community_id = ${hub.community_id} OR EXISTS (SELECT 1 FROM hub_community_leaders hcl WHERE hcl.hub_id = ${hub.id} AND hcl.user_id = u.id)` : sql`EXISTS (SELECT 1 FROM hub_community_leaders hcl WHERE hcl.hub_id = ${hub.id} AND hcl.user_id = u.id)`}`),
        db.select({ count: sql<number>`COUNT(*)::int` }).from(griotStoriesTable).where(and(eq(griotStoriesTable.hub_id, hub.id), eq(griotStoriesTable.status, "published"), eq(griotStoriesTable.visibility, "public"))),
        db.select({ count: sql<number>`COUNT(*)::int` }).from(requestsTable).where(and(
          eq(requestsTable.status, "open"),
          hub.community_id != null
            ? or(eq(requestsTable.hub_id, hub.id), sql`${requestsTable.requester_id} IN (SELECT id FROM users WHERE community_id = ${hub.community_id})`)
            : eq(requestsTable.hub_id, hub.id),
        )),
        db.select({ count: sql<number>`COUNT(*)::int` }).from(requestsTable).where(and(
          eq(requestsTable.status, "completed"),
          hub.community_id != null
            ? or(eq(requestsTable.hub_id, hub.id), sql`${requestsTable.requester_id} IN (SELECT id FROM users WHERE community_id = ${hub.community_id})`)
            : eq(requestsTable.hub_id, hub.id),
        )),
        hub.community_id != null ? db.select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` }).from(communityPoolLedgerTable).where(eq(communityPoolLedgerTable.community_id, hub.community_id)) : Promise.resolve([{ balance: 0 }]),
      ]);
      const activeHelpers = liveHelpersByHub.get(hub.id)?.size ?? 0;
      const live = presence.hubs.find((item) => item.hub_id === hub.id);
      return {
        ...hub,
        id: hub.id,
        name: hub.name,
        hub_id: hub.id,
        hub_name: hub.name,
        region: hub.region_label,
        primary_hub_id: hub.primary_hub_id ?? null,
        anchor_city: hub.anchor_city ?? null,
        member_count: Number(memberRow.rows[0]?.count ?? 0),
        live_user_count: live?.live_user_count ?? 0,
        story_count: storyRow[0]?.count ?? 0,
        neighborhood_count,
        spiral_count,
        open_requests: openRequestRow[0]?.count ?? 0,
        activity: { active_helpers: activeHelpers, requests_fulfilled: fulfilledRow[0]?.count ?? 0, pool_balance: Number(poolRow[0]?.balance ?? 0) },
      };
    }));

    const activeNeighborhoods = [...liveUsersByNeighborhood.values()].filter((count) => count > 0).length;
    const totals = enriched.reduce((acc, hub) => ({
      members: acc.members + hub.member_count,
      live: acc.live + hub.live_user_count,
      stories: acc.stories + hub.story_count,
      active_helpers: acc.active_helpers + hub.activity.active_helpers,
      open_requests: acc.open_requests + hub.open_requests,
      requests_fulfilled: acc.requests_fulfilled + hub.activity.requests_fulfilled,
      pool_balance: acc.pool_balance + hub.activity.pool_balance,
    }), { members: 0, live: 0, stories: 0, active_helpers: 0, open_requests: 0, requests_fulfilled: 0, pool_balance: 0 });
    totals.members = uniqueMembers.rows.length;
    totals.active_helpers = [...liveHelpersByHub.values()].reduce((total, helpers) => total + helpers.size, 0);
    totals.open_requests = uniqueOpenRequests.rows.length;
    totals.requests_fulfilled = uniqueFulfilledRequests.rows.length;
    totals.pool_balance = Number(uniquePool.rows[0]?.balance ?? 0);

    // Globe *display* grouping only: a legacy local-city hub with
    // primary_hub_id set (e.g. a pre-existing Brazil city hub) is folded
    // into its country's canonical marker so the Globe shows one dot per
    // country instead of one per historical city seed. Nothing about the
    // underlying hub rows changes — community_id, stories, pledges, and
    // hub ids are untouched; the merged cities are still reachable via
    // local_hubs for drill-down inside the country's Hub view.
    // Keep local/city rows available while enriching and aggregating their
    // activity, then emit only canonical country/state roots to the Globe.
    // `mergeHubsForGlobeDisplay` attaches grouped local rows beneath those
    // roots without creating extra markers.
    const globeHubs = mergeHubsForGlobeDisplay(enriched).filter(isCanonicalGlobeHub);

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization, Cookie");
    res.setHeader("X-Niakofa-Village-Pulse", "verified");
    res.json({
      generated_at: presence.generated_at,
      freshness_window_seconds: presence.freshness_window_seconds,
      current_user: { ...presence.current_user, current_neighborhood: currentNeighborhood, location_verification: locationVerification },
      totals: { ...totals, active_neighborhoods: activeNeighborhoods },
      hubs: globeHubs,
      neighborhoods: neighborhoods.filter((n) => n.geometry_verified).map((n) => ({ neighborhood_id: n.neighborhood_id, name: n.name, emoji: n.emoji, live_user_count: liveUsersByNeighborhood.get(n.id) ?? 0, gps_verified: true, geometry_effective_at: n.geometry_effective_at?.toISOString?.() ?? n.geometry_effective_at ?? null })),
    });
  } catch {
    res.status(503).json({ error: "Global Village pulse is temporarily unavailable." });
  }
});

export default router;
