import { Router } from "express";
import { distanceMiles } from "../lib/geo.js";
import { db, usersTable, requestsTable, userSettingsTable, helperAvailabilityTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { eq, and, sql, inArray } from "drizzle-orm";
import { GetOnlineHelpersQueryParams } from "@workspace/api-zod";
import { computeMatchScore } from "../lib/matching";

const router = Router();

router.get("/helpers/online", requireAuth, async (req, res) => {
  const params = GetOnlineHelpersQueryParams.safeParse({
    lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : undefined,
  });

  const radius = (params.success && params.data.radius_miles) ? params.data.radius_miles : 10;
  const lat = params.success ? params.data.lat : undefined;
  const lng = params.success ? params.data.lng : undefined;

  // Only include helpers who've opted in via Settings — same
  // privacy_live_location preference enforced on the location-update route.
  const optedInUserIds = await db
    .select({ user_id: userSettingsTable.user_id })
    .from(userSettingsTable)
    .where(eq(userSettingsTable.privacy_live_location, true));
  const optedInIdSet = optedInUserIds.map(r => r.user_id);
  if (optedInIdSet.length === 0) return res.json([]);

  // SQL bounding-box pre-filter — avoids full table scan
  let query = db.select().from(usersTable).$dynamic();
  const conditions = [eq(usersTable.helper_mode_active, true), inArray(usersTable.id, optedInIdSet)];
  if (lat && lng) {
    const latDelta = radius / 69;
    const lngDelta = radius / (69 * Math.cos(lat * Math.PI / 180));
    conditions.push(
      sql`${usersTable.lat} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
      sql`${usersTable.lng} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`
    );
  }
  const helpers = await query.where(and(...conditions));

  const result = helpers
    .filter(h => h.lat !== null && h.lng !== null)
    .map(h => {
      const dist = lat && lng ? distanceMiles(lat, lng, h.lat!, h.lng!) : null;
      // Wait-time estimate: 3 min/mile walking baseline, adjusted by trust score
      const eta_minutes = dist != null ? Math.round(dist * 3) : null;
      return {
        id: h.id,
        name: h.name,
        avatar_url: h.avatar_url,
        lat: h.lat!,
        lng: h.lng!,
        heading: h.heading,
        trust_score: h.trust_score,
        help_count: h.help_count,
        is_online: true,
        active_request_id: null,
        distance_miles: dist,
        eta_minutes,
      };
    })
    .filter(h => lat && lng ? (h.distance_miles ?? 999) <= radius : true)
    // Trust-weighted sort: distance is primary, trust_score breaks ties
    .sort((a, b) => {
      const distDiff = (a.distance_miles ?? 999) - (b.distance_miles ?? 999);
      if (Math.abs(distDiff) > 0.1) return distDiff;
      return (b.trust_score ?? 0) - (a.trust_score ?? 0);
    });

  return res.json(result);
});

// Auto-assign nearest available helper to a request
// NOTE: despite the name, this endpoint only SUGGESTS the nearest helper —
// it never writes to the database. There is no actual auto-assignment
// happening here. If real auto-assignment is needed later, this is where
// a requestsTable.update(...) call would need to be added.
// Admin-only: no frontend caller exists for this route (grepped, none found);
// it was reachable by any authenticated user with just requireAuth, which
// could be used to enumerate which helpers are near a given request/location
// — a privacy leak with no legitimate non-admin use case.
router.post("/helpers/auto-assign/:requestId", requireAuth, requireAdmin(), async (req, res) => {
  const requestId = parseInt(req.params.requestId as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid requestId" });

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "open") return res.status(409).json({ error: "Request is not open" });

  const latDelta = 5 / 69;
  const lngDelta = 5 / (69 * Math.cos(request.lat * Math.PI / 180));

  const helpers = await db.select().from(usersTable).where(
    and(
      eq(usersTable.helper_mode_active, true),
      sql`${usersTable.lat} BETWEEN ${request.lat - latDelta} AND ${request.lat + latDelta}`,
      sql`${usersTable.lng} BETWEEN ${request.lng - lngDelta} AND ${request.lng + lngDelta}`
    )
  );

  if (helpers.length === 0) return res.status(404).json({ error: "No helpers available nearby" });

  // Fetch availability windows for all candidate helpers in one query
  const helperIds = helpers.filter(h => h.lat && h.lng).map(h => h.id);
  const allWindows = helperIds.length > 0
    ? await db.select().from(helperAvailabilityTable).where(inArray(helperAvailabilityTable.user_id, helperIds))
    : [];
  const windowsByHelper: Record<number, typeof allWindows> = {};
  for (const w of allWindows) {
    (windowsByHelper[w.user_id] ??= []).push(w);
  }

  const now = new Date();
  const scored = helpers
    .filter(h => h.lat && h.lng)
    .map(h => {
      const dist = distanceMiles(request.lat, request.lng, h.lat!, h.lng!);
      const { score } = computeMatchScore(
        { helper_skills: h.helper_skills, specialties: h.specialties },
        request.category,
        request.urgency,
        dist,
        windowsByHelper[h.id] ?? [],
        now
      );
      return { ...h, dist, score };
    })
    // Higher score wins; distance breaks ties among equal scores
    .sort((a, b) => b.score !== a.score ? b.score - a.score : a.dist - b.dist);

  const nearest = scored[0];
  if (!nearest) return res.status(404).json({ error: "No helpers with valid location" });

  return res.json({
    helper_id: nearest.id,
    helper_name: nearest.name,
    distance_miles: nearest.dist,
    eta_minutes: Math.round(nearest.dist * 3),
    match_score: nearest.score,
  });
});

export default router;
