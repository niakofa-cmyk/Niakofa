/**
 * GET /nia/context
 *
 * Returns live community context for the current user's location.
 * This data is passed to nia-service with each chat message so Nia
 * can make grounded, specific statements about what's happening nearby
 * rather than speaking in generalities.
 *
 * SCHEMA NOTE: Uses helper_mode_active + lat + lng on users table.
 * (is_online, lat_last, lng_last do NOT exist — those were column names
 * from a prior draft. The real columns are helper_mode_active, lat, lng.)
 *
 * Response shape:
 * {
 *   openRequestsNearby: number,     // open requests within 2 miles
 *   helpersOnlineNearby: number,    // helpers in helper_mode_active within 2 miles
 *   topCategory: string | null,     // most common open request category nearby
 *   estimatedResponseMinutes: number | null,  // rough time-to-first-response
 *   neighborhood: string | null,    // user's neighborhood from the nearest request
 * }
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { db, usersTable, requestsTable, userSettingsTable, systemSettingsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { distanceMiles } from "../lib/geo";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Fail-closed kill-switch check — mirrors the one in nia-proxy.ts.
 * Any error (DB down, row missing, wrong value) defaults to DISABLED.
 */
async function isNiaEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    return row?.value === "true";
  } catch {
    return false; // fail-closed: DB error → Nia disabled
  }
}

const NEARBY_RADIUS_MILES = 2;
const CACHE_TTL_MS = 30_000; // 30-second cache per user

// Simple in-process cache — avoids hammering the DB on every chat open
const contextCache = new Map<
  number,
  { data: NiaContext; fetchedAt: number }
>();

export interface NiaContext {
  openRequestsNearby: number;
  helpersOnlineNearby: number;
  topCategory: string | null;
  estimatedResponseMinutes: number | null;
  neighborhood: string | null;
}

router.get("/nia/context", requireAuth, generalApiLimiter, async (req, res) => {
  // Kill-switch: context endpoint must be gated just like all other Nia routes.
  // Without this check the endpoint leaks real-time community stats even when
  // an admin has disabled Nia for legal/technical reasons.
  if (!(await isNiaEnabled())) {
    return res.status(503).json({ error: "Nia is temporarily unavailable." });
  }

  const userId = req.authenticatedUserId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const latParam = req.query.lat ? parseFloat(req.query.lat as string) : null;
  const lngParam = req.query.lng ? parseFloat(req.query.lng as string) : null;

  if (latParam === null || lngParam === null || isNaN(latParam) || isNaN(lngParam)) {
    return res.status(400).json({ error: "lat and lng are required" });
  }

  // Check cache
  const cached = contextCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const lat = latParam;
    const lng = lngParam;

    // Bounding box for 2-mile radius
    const latDelta = NEARBY_RADIUS_MILES / 69;
    const lngDelta =
      NEARBY_RADIUS_MILES / (69 * Math.cos((lat * Math.PI) / 180));

    // ── 1. Open requests nearby ──────────────────────────────────────────────
    const nearbyRequests = await db
      .select({
        id: requestsTable.id,
        category: requestsTable.category,
        lat: requestsTable.lat,
        lng: requestsTable.lng,
        neighborhood: requestsTable.neighborhood,
      })
      .from(requestsTable)
      .where(
        and(
          eq(requestsTable.status, "open"),
          sql`${requestsTable.lat} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
          sql`${requestsTable.lng} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`
        )
      )
      .limit(200);

    // Filter to true radius distance
    const requestsInRadius = nearbyRequests.filter((r: (typeof nearbyRequests)[number]) => {
      if (r.lat === null || r.lng === null) return false;
      return distanceMiles(lat, lng, r.lat, r.lng) <= NEARBY_RADIUS_MILES;
    });

    const openRequestsNearby = requestsInRadius.length;

    // Top category
    const categoryCounts: Record<string, number> = {};
    for (const r of requestsInRadius) {
      if (r.category) {
        categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
      }
    }
    const topCategory =
      Object.keys(categoryCounts).sort(
        (a, b) => categoryCounts[b] - categoryCounts[a]
      )[0] ?? null;

    // Neighborhood from closest request
    const neighborhood =
      requestsInRadius.find((r: (typeof requestsInRadius)[number]) => r.neighborhood)?.neighborhood ?? null;

    // ── 2. Helpers online nearby ─────────────────────────────────────────────
    // Only count helpers who've opted into live location sharing
    const optedIn = await db
      .select({ user_id: userSettingsTable.user_id })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.privacy_live_location, true));

    const optedInIds = optedIn.map((r: { user_id: number }) => r.user_id);

    let helpersOnlineNearby = 0;
    if (optedInIds.length > 0) {
      const nearbyHelpers = await db
        .select({ id: usersTable.id, lat: usersTable.lat, lng: usersTable.lng })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.helper_mode_active, true),
            inArray(usersTable.id, optedInIds),
            sql`${usersTable.lat} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
            sql`${usersTable.lng} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`
          )
        );

      helpersOnlineNearby = nearbyHelpers.filter(
        (h: (typeof nearbyHelpers)[number]) =>
          h.lat !== null &&
          h.lng !== null &&
          distanceMiles(lat, lng, h.lat, h.lng) <= NEARBY_RADIUS_MILES
      ).length;
    }

    // ── 3. Estimated response time ───────────────────────────────────────────
    // Simple heuristic: if helpers online, estimate based on count and time of day
    let estimatedResponseMinutes: number | null = null;
    if (helpersOnlineNearby > 0) {
      const hour = new Date().getHours();
      const isPeakHours = hour >= 9 && hour <= 21;
      const baseMinutes = isPeakHours ? 15 : 30;
      // More helpers = faster response, with diminishing returns
      estimatedResponseMinutes = Math.max(
        5,
        Math.round(baseMinutes / Math.sqrt(helpersOnlineNearby))
      );
    }

    const context: NiaContext = {
      openRequestsNearby,
      helpersOnlineNearby,
      topCategory,
      estimatedResponseMinutes,
      neighborhood,
    };

    // Cache the result
    contextCache.set(userId, { data: context, fetchedAt: Date.now() });

    // Evict stale entries every 5 minutes to prevent unbounded growth
    if (contextCache.size > 1000) {
      const evictBefore = Date.now() - CACHE_TTL_MS * 10;
      for (const [k, v] of contextCache.entries()) {
        if (v.fetchedAt < evictBefore) contextCache.delete(k);
      }
    }

    return res.json(context);
  } catch (err) {
    logger.error({ err, userId }, "nia-context: failed to fetch context");
    return res.status(500).json({ error: "Failed to fetch community context" });
  }
});

export default router;
