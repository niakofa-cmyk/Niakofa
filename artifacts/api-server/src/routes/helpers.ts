import { Router } from "express";
import { distanceMiles } from "../lib/geo.js";
import { db, usersTable, requestsTable, userSettingsTable, helperAvailabilityTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { eq, and, sql, inArray } from "drizzle-orm";
import { GetOnlineHelpersQueryParams } from "@workspace/api-zod";
import { computeMatchScore } from "../lib/matching";

/**
 * Fuzz helper live-location by ~100 m — same order of magnitude as the
 * request-coordinate jitter applied in requests.ts.
 *
 * Design choice: helpers who opt into "share my live location" expect a
 * rideshare-style approximate dot, not their exact GPS fix (which is
 * home-address-precision when they toggle on at home).  The fuzz key is the
 * helper's user ID so the same helper always maps to the same offset within a
 * session — the dot doesn't jump around on repeated fetches.
 *
 * Product note: if a future trust/verification use case requires exact
 * precision, add a separate opt-in flag (e.g. privacy_exact_location) rather
 * than removing this fuzz for everyone.
 */
function fuzzHelperCoords(lat: number, lng: number, userId: number): { lat: number; lng: number } {
  // ~100 m ≈ 0.001 degrees latitude
  const h1 = Math.abs(Math.sin(userId * 127.1 + 43758.5453) * 43758.5453);
  const h2 = Math.abs(Math.sin(userId * 311.7 + 78231.1234) * 78231.1234);
  const fuzzLat = ((h1 % 10000) / 10000 - 0.5) * 0.002;
  const fuzzLng = ((h2 % 10000) / 10000 - 0.5) * 0.002 / Math.cos(lat * (Math.PI / 180));
  return {
    lat: Math.round((lat + fuzzLat) * 1e5) / 1e5,
    lng: Math.round((lng + fuzzLng) * 1e5) / 1e5,
  };
}

const router = Router();

router.get("/helpers/online", requireAuth, async (req, res) => {
  const params = GetOnlineHelpersQueryParams.safeParse({
    lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : undefined,
  });

  // Optional language/heritage filter — e.g. ?language=sw,yo returns only helpers
  // whose helper_languages array contains at least one of the requested languages.
  const languageFilter: string[] | null = req.query.language
    ? String(req.query.language).split(",").map(l => l.trim().toLowerCase()).filter(Boolean)
    : null;

  const radius = (params.success && params.data.radius_miles) ? params.data.radius_miles : 10;
  const rawLat = params.success ? params.data.lat : undefined;
  const rawLng = params.success ? params.data.lng : undefined;
  // lat/lng of exactly 0 (equator / prime meridian) is a valid coordinate —
  // a `lat && lng` truthy check would silently treat it as "no location
  // given," skipping the bounding-box filter, distance calc, and radius
  // filter entirely and returning every opted-in helper globally with no
  // distance limit. Same bug class already fixed in navigation.ts (SOS
  // location string) and verification.ts (SOS lat/lng) this session.
  // Using a combined object (rather than a separate boolean flag) so
  // TypeScript actually narrows lat/lng to `number` inside `if (location)`
  // blocks below, instead of leaving them as `number | undefined`.
  const location = (rawLat != null && rawLng != null) ? { lat: rawLat, lng: rawLng } : null;

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
  // A suspended helper or one whose helper application was denied/revoked
  // must never show up as "available" on the map, even if their
  // helper_mode_active flag is still stale true from before the moderation
  // action. Enforce both gates at the query level so this can never regress
  // to relying solely on the moderation route flipping helper_mode_active.
  const conditions = [
    eq(usersTable.helper_mode_active, true),
    eq(usersTable.is_suspended, false),
    eq(usersTable.helper_status, "approved"),
    inArray(usersTable.id, optedInIdSet),
  ];
  if (location) {
    const latDelta = radius / 69;
    const lngDelta = radius / (69 * Math.cos(location.lat * Math.PI / 180));
    conditions.push(
      sql`${usersTable.lat} BETWEEN ${location.lat - latDelta} AND ${location.lat + latDelta}`,
      sql`${usersTable.lng} BETWEEN ${location.lng - lngDelta} AND ${location.lng + lngDelta}`
    );
  }
  const helpers = await query.where(and(...conditions));

  const result = helpers
    .filter(h => h.lat !== null && h.lng !== null)
    // Language/heritage filter: if ?language= is provided, only include helpers who speak
    // at least one of the requested languages. Uses the helper_languages text[] column.
    .filter(h => {
      if (!languageFilter || languageFilter.length === 0) return true;
      const langs = (h.helper_languages ?? []).map((l: string) => l.toLowerCase());
      return languageFilter.some(f => langs.includes(f));
    })
    .map(h => {
      const dist = location ? distanceMiles(location.lat, location.lng, h.lat!, h.lng!) : null;
      // Wait-time estimate: 3 min/mile walking baseline, adjusted by trust score
      const eta_minutes = dist != null ? Math.round(dist * 3) : null;
      const { lat: fLat, lng: fLng } = fuzzHelperCoords(h.lat!, h.lng!, h.id);
      return {
        id: h.id,
        name: h.name,
        avatar_url: h.avatar_url,
        lat: fLat,
        lng: fLng,
        heading: h.heading,
        trust_score: h.trust_score,
        help_count: h.help_count,
        is_online: true,
        active_request_id: null,
        distance_miles: dist,
        eta_minutes,
        languages: h.helper_languages ?? [],
      };
    })
    .filter(h => location ? (h.distance_miles ?? 999) <= radius : true)
    // Trust-weighted sort: distance is primary, trust_score breaks ties
    .sort((a, b) => {
      const distDiff = (a.distance_miles ?? 999) - (b.distance_miles ?? 999);
      if (Math.abs(distDiff) > 0.1) return distDiff;
      return (b.trust_score ?? 0) - (a.trust_score ?? 0);
    });

  return res.json(result);
});

// GET /helpers/:id — public helper profile (safe fields only; no PII)
// Used by request pages, recurring request cards, and the donor/thank-you flow
// to show who helped. Returns 404 when the user isn't a helper (helper_status!=approved).
router.get("/helpers/:id", requireAuth, async (req, res) => {
  const helperId = parseInt(req.params.id as string);
  if (isNaN(helperId)) return res.status(400).json({ error: "Invalid helper id" });

  const [helper] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
      helper_bio: usersTable.helper_bio,
      helper_skills: usersTable.helper_skills,
      trust_score: usersTable.trust_score,
      help_count: usersTable.help_count,
      helper_mode_active: usersTable.helper_mode_active,
      helper_status: usersTable.helper_status,
    })
    .from(usersTable)
    .where(eq(usersTable.id, helperId))
    .limit(1);

  if (!helper || helper.helper_status !== "approved") {
    return res.status(404).json({ error: "Helper not found" });
  }

  return res.json({
    id: helper.id,
    name: helper.name,
    avatar_url: helper.avatar_url,
    helper_bio: helper.helper_bio ?? null,
    helper_skills: helper.helper_skills ?? [],
    trust_score: helper.trust_score ?? 0,
    help_count: helper.help_count ?? 0,
    is_online: helper.helper_mode_active,
  });
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

  // Configurable radius — default 10 mi, max 50 mi.
  // Larger defaults help sparse rural areas (rural Africa, tribal lands, Appalachia)
  // find helpers beyond the old hardcoded 5-mile cap.
  const rawRadius = parseFloat((req.query.radius_miles as string | undefined) ?? "10");
  const radius = Math.min(50, Math.max(1, isNaN(rawRadius) ? 10 : rawRadius));
  const latDelta = radius / 69;
  const lngDelta = radius / (69 * Math.cos(request.lat * Math.PI / 180));

  const helpers = await db.select().from(usersTable).where(
    and(
      eq(usersTable.helper_mode_active, true),
      sql`${usersTable.lat} BETWEEN ${request.lat - latDelta} AND ${request.lat + latDelta}`,
      sql`${usersTable.lng} BETWEEN ${request.lng - lngDelta} AND ${request.lng + lngDelta}`
    )
  );

  if (helpers.length === 0) return res.status(404).json({ error: "No helpers available nearby" });

  // Fetch availability windows for all candidate helpers in one query
  // Use null-checks, not truthy: lat/lng of 0 is valid at the equator/prime meridian
  const helperIds = helpers.filter(h => h.lat != null && h.lng != null).map(h => h.id);
  const allWindows = helperIds.length > 0
    ? await db.select().from(helperAvailabilityTable).where(inArray(helperAvailabilityTable.user_id, helperIds))
    : [];
  const windowsByHelper: Record<number, typeof allWindows> = {};
  for (const w of allWindows) {
    (windowsByHelper[w.user_id] ??= []).push(w);
  }

  const now = new Date();
  const scored = helpers
    .filter(h => h.lat != null && h.lng != null)
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
