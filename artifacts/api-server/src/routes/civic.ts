import { Router } from "express";
import { db, civicResourcesTable, civicSuggestionsTable, governmentSponsorsTable, requestsTable, communitiesTable, civicNeedsTable, civicInvoicesTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { cacheGet, cacheSet, cacheDel } from "../lib/cache";
import { sendPushToUser } from "./push";
import { distanceMiles } from "../lib/geo.js";
import { normalizeMapboxStateCode } from "../lib/civic-geo.js";
import { GetCivicResourcesNearbyQueryParams, GetCivicNeedsNearbyQueryParams } from "@workspace/api-zod";

const VALID_CIVIC_NEED_CATEGORIES = [
  "infrastructure", "cleanup", "elder_care", "food_security",
  "disaster_relief", "education", "public_safety", "other",
];

/** Look up the caller's approved gov-sponsor record, or null. */
async function getApprovedSponsor(userId: number) {
  const [sponsor] = await db
    .select({
      id: governmentSponsorsTable.id,
      entity_name: governmentSponsorsTable.entity_name,
      county: governmentSponsorsTable.county,
      state: governmentSponsorsTable.state,
      city: governmentSponsorsTable.city,
    })
    .from(governmentSponsorsTable)
    .where(
      and(
        eq(governmentSponsorsTable.submitted_by_user_id, userId),
        eq(governmentSponsorsTable.approval_status, "approved"),
      ),
    )
    .limit(1);
  return sponsor ?? null;
}

const CIVIC_TTL = 3600; // 1 hour — civic resources change rarely
const CIVIC_GEO_TTL = 300; // 5 min — nearby-map queries are viewport-driven, shorter TTL than region lookups
const MAPBOX_REQUEST_TIMEOUT_MS = 5000;

const router = Router();

// Geographic input hardening: never send malformed or out-of-world
// coordinates to Mapbox or use them to broaden a civic-resource lookup.
function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function normalizeJurisdiction(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN ?? "";

interface MapboxFeature {
  place_type: string[];
  text: string;
  place_name: string;
  short_code?: string;
  properties?: { short_code?: string };
  context?: { id: string; text: string; short_code?: string }[];
}

interface MapboxGeocodingResponse {
  features: MapboxFeature[];
}

export interface ResolvedPlace {
  city: string | null;
  county: string | null;
  state: string | null;
  state_short: string | null;
  place_name: string;
}

export class ReverseGeocodeUnavailableError extends Error {
  readonly code = "REVERSE_GEOCODE_UNAVAILABLE";

  constructor(message = "Reverse geocoding is temporarily unavailable") {
    super(message);
    this.name = "ReverseGeocodeUnavailableError";
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  if (!MAPBOX_TOKEN) {
    // Fail fast instead of firing a doomed request at Mapbox with an empty
    // token — avoids per-request network latency + log noise when the token
    // is misconfigured. Callers distinguish this outage from a valid
    // no-feature response so a transient provider failure cannot clear an
    // existing community assignment.
    logger.warn("reverseGeocode called with no MAPBOX_TOKEN configured");
    throw new ReverseGeocodeUnavailableError("Mapbox token is not configured");
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,district,region&access_token=${MAPBOX_TOKEN}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPBOX_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Mapbox geocoding non-200");
      throw new ReverseGeocodeUnavailableError(`Mapbox returned HTTP ${res.status}`);
    }
    const data = await res.json() as MapboxGeocodingResponse;
    if (!data.features || data.features.length === 0) return null;

    let city: string | null = null;
    let county: string | null = null;
    let state: string | null = null;
    let state_short: string | null = null;
    let place_name = "";

    for (const feature of data.features) {
      const types = feature.place_type ?? [];
      const ctx = feature.context ?? [];

      if (types.includes("place") && !city) {
        city = feature.text;
        place_name = feature.place_name;

        for (const c of ctx) {
          if (c.id.startsWith("district.")) {
            county = c.text.replace(/ County$/i, "").trim();
          }
          if (c.id.startsWith("region.")) {
            state = c.text.trim();
            state_short = normalizeMapboxStateCode(c.short_code, c.text);
          }
        }
      }

      if (types.includes("district") && !county) {
        county = feature.text.replace(/ County$/i, "").trim();
        for (const c of ctx) {
          if (c.id.startsWith("region.")) {
            state = c.text.trim();
            state_short = normalizeMapboxStateCode(c.short_code, c.text);
          }
        }
      }

      if (types.includes("region") && !state) {
        state = feature.text.trim();
        state_short = normalizeMapboxStateCode(
          feature.short_code ?? feature.properties?.short_code,
          feature.text,
        );
      }
    }

    return { city, county, state_short, state, place_name: place_name || `${city ?? ""}, ${state_short ?? ""}`.trim() };
  } catch (err) {
    if (err instanceof ReverseGeocodeUnavailableError) throw err;
    logger.warn({ err }, "Mapbox reverse geocode failed");
    throw new ReverseGeocodeUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

// ── Map geo helpers (Community Map Backend Geo) ────────────────────────────

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Parses a civicResourcesTable.open_hours JSON string (see schema doc
 * comment) and returns whether the resource is open right now.
 * Interpreted in server-local time — see schema comment for the caveat.
 * Returns "unknown" for missing/malformed data rather than guessing, so the
 * frontend can render a neutral state instead of a wrong open/closed badge.
 */
function computeOpenStatus(openHours: string | null | undefined, now: Date = new Date()): "open" | "closed" | "unknown" {
  if (!openHours) return "unknown";
  let schedule: Record<string, string | null>;
  try {
    schedule = JSON.parse(openHours);
  } catch {
    return "unknown";
  }
  const todayRange = schedule[DAY_KEYS[now.getDay()]];
  if (todayRange === null || todayRange === undefined) return "closed";

  const [startStr, endStr] = todayRange.split("-");
  const start = startStr?.split(":").map(Number);
  const end = endStr?.split(":").map(Number);
  if (!start || !end || start.length !== 2 || end.length !== 2 || [...start, ...end].some(Number.isNaN)) {
    return "unknown";
  }
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = start[0] * 60 + start[1];
  const endMin = end[0] * 60 + end[1];
  return (nowMin >= startMin && nowMin < endMin) ? "open" : "closed";
}

/** Forward-geocode a free-text place query ("Fort Worth, TX") to a lat/lng via Mapbox. */
async function forwardGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN) {
    logger.warn("forwardGeocode called with no MAPBOX_TOKEN configured");
    return null;
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&types=place,district,region&access_token=${MAPBOX_TOKEN}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPBOX_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ status: res.status, query }, "Mapbox forward geocoding non-200");
      return null;
    }
    const data = await res.json() as { features?: { center?: [number, number] }[] };
    const center = data.features?.[0]?.center;
    if (!center) return null;
    return { lat: center[1], lng: center[0] };
  } catch (err) {
    logger.warn({ err, query }, "Mapbox forward geocode failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves lat/lng for a civic need that doesn't have one yet, by forward-
 * geocoding the posting sponsor's city/county/state, and persists the result
 * so it's only geocoded once. Best-effort — returns null (never throws) if
 * geocoding is unavailable or fails, leaving the need un-plottable but every
 * other field intact.
 */
async function resolveNeedCoords(
  needId: number,
  sponsor: { city?: string | null; county: string; state: string },
): Promise<{ lat: number; lng: number } | null> {
  const query = [sponsor.city, sponsor.county ? `${sponsor.county} County` : null, sponsor.state]
    .filter(Boolean)
    .join(", ");
  const coords = await forwardGeocode(query);
  if (!coords) return null;

  await db.update(civicNeedsTable)
    .set({ lat: coords.lat, lng: coords.lng })
    .where(eq(civicNeedsTable.id, needId));

  return coords;
}

// GET /civic/resources?lat=X&lng=Y
// Anonymous (no requireAuth, by design — resources should be visible pre-signup),
// but the lat/lng branch triggers a paid Mapbox geocoding call per unique
// rounded coordinate, so it must still be rate-limited or an anonymous
// caller can burn the account's Mapbox quota with scripted requests.
router.get("/civic/resources", generalApiLimiter, async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (!isValidCoordinate(lat, lng)) {
    if (req.query.lat !== undefined || req.query.lng !== undefined) {
      return res.status(400).json({ error: "lat and lng must be valid geographic coordinates" });
    }

    // A location-aware endpoint must not return an arbitrary global slice when
    // a caller has not supplied a location.
    return res.json({
      resources: [],
      place_name: "location required",
      match_level: "fallback" as const,
    });
  }

  const latRounded = Math.round(lat * 10) / 10;
  const lngRounded = Math.round(lng * 10) / 10;
  // Bump when jurisdiction matching changes so a pre-fix empty response
  // cannot remain authoritative for the full location-cache TTL.
  const locationCacheKey = `civic:v5:loc:${latRounded}:${lngRounded}`;
  const locationCached = await cacheGet(locationCacheKey);
  if (locationCached) return res.json(locationCached);

  let place: ResolvedPlace | null;
  try {
    place = await reverseGeocode(lat, lng);
  } catch (err) {
    logger.warn({ err, lat, lng }, "civic resources geocoding unavailable");
    // Do not cache an outage as a verified location result. A later request
    // should retry once Mapbox recovers.
    return res.json({
      resources: [],
      place_name: "location could not be verified",
      match_level: "fallback" as const,
    });
  }

  if (!place || !place.state_short) {
    // We couldn't determine the user's location at all — showing an
    // arbitrary sample of whatever happens to be in the table would be
    // misleading: it could be labeled "your area" while belonging to a
    // completely different region. Be honest instead: report no resources.
    const result = { resources: [], place_name: "location could not be verified", match_level: "fallback" as const };
    await cacheSet(locationCacheKey, result, CIVIC_TTL);
    return res.json(result);
  }

  const state = normalizeJurisdiction(place.state_short)?.toUpperCase() ?? null;
  const county = normalizeJurisdiction(place.county);
  const city = normalizeJurisdiction(place.city);

  if (!state) {
    return res.status(200).json({
      resources: [],
      place_name: place.place_name || "your area",
      city,
      county: county ? `${county} County` : null,
      state: null,
      match_level: "fallback" as const,
    });
  }

  let matchLevel: "city" | "county" | "state" | "fallback" = "fallback";
  let resources: (typeof civicResourcesTable.$inferSelect)[] = [];

  if (city && county) {
    resources = await db
      .select()
      .from(civicResourcesTable)
      .where(
        and(
          eq(civicResourcesTable.state, state),
          eq(civicResourcesTable.county, county),
          eq(civicResourcesTable.city, city)
        )
      )
      .orderBy(desc(civicResourcesTable.is_authoritative), desc(civicResourcesTable.coverage_status));
    if (resources.length > 0) matchLevel = "city";
  }

  if (resources.length === 0 && county) {
    resources = await db
      .select()
      .from(civicResourcesTable)
      .where(
        and(
          eq(civicResourcesTable.state, state),
          eq(civicResourcesTable.county, county)
        )
      )
      .orderBy(desc(civicResourcesTable.is_authoritative), desc(civicResourcesTable.coverage_status));
    if (resources.length > 0) matchLevel = "county";
  }

  if (resources.length === 0) {
    resources = await db
      .select()
      .from(civicResourcesTable)
      .where(eq(civicResourcesTable.state, state))
      .orderBy(desc(civicResourcesTable.is_authoritative), desc(civicResourcesTable.coverage_status));
    if (resources.length > 0) matchLevel = "state";
  }

  // If city/county/state all miss, keep resources empty rather than showing
  // an unrelated region's organizations as though they were local.

  logger.info({ lat, lng, state, county, city, matchLevel, count: resources.length }, "civic resources resolved");

  const payload = {
    resources,
    place_name: place.place_name,
    city: place.city,
    county: place.county ? `${place.county} County` : null,
    // Keep the display label human-readable; the canonical short code is used
    // internally above for database matching.
    state: place.state ?? place.state_short,
    match_level: matchLevel,
  };
  await cacheSet(locationCacheKey, payload, CIVIC_TTL);
  return res.json(payload);
});

// GET /civic/resources/nearby?lat=&lng=&radius_miles=&category=
//
// Map-focused variant of /civic/resources: instead of region matching
// (state/county/city string equality), returns resources with real
// coordinates within a radius of a point — the shape the community map's
// bottom-sheet needs (address, open/closed status, phone). Additive: the
// original /civic/resources route and its region-based response shape are
// untouched, so existing callers keep working.
//
// Anonymous like /civic/resources (resources should be visible pre-signup),
// rate-limited for the same reason (bounding-box query is cheap, but this is
// still a scrapable public endpoint).
router.get("/civic/resources/nearby", generalApiLimiter, async (req, res) => {
  const parsed = GetCivicResourcesNearbyQueryParams.safeParse({
    lat: req.query.lat !== undefined ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng !== undefined ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles !== undefined ? parseFloat(req.query.radius_miles as string) : undefined,
    category: req.query.category,
  });
  if (!parsed.success || !isValidCoordinate(parsed.data.lat, parsed.data.lng)) {
    return res.status(400).json({ error: "lat and lng must be valid geographic coordinates" });
  }
  const { lat, lng } = parsed.data;
  const radius = Math.min(50, Math.max(0.1, parsed.data.radius_miles));
  const category = parsed.data.category?.trim().toLowerCase() || null;

  const latR = Math.round(lat * 100) / 100;
  const lngR = Math.round(lng * 100) / 100;
  const cacheKey = `civic:v2:nearby:${latR}:${lngR}:${radius}:${category ?? "*"}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  // Bounding-box pre-filter (same pattern as helpers/online), then exact
  // Haversine distance + sort. civic_resources has no PostGIS geography
  // column, so this JS-side filter is the pragmatic choice — the table is
  // small (curated org list, not user-generated).
  const latDelta = radius / 69;
  const lngDelta = radius / (69 * Math.cos(lat * Math.PI / 180));

  const conditions = [
    isNotNull(civicResourcesTable.latitude),
    isNotNull(civicResourcesTable.longitude),
    sql`${civicResourcesTable.latitude} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
    sql`${civicResourcesTable.longitude} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`,
  ];
  if (category) conditions.push(eq(civicResourcesTable.category, category));

  const rows = await db.select().from(civicResourcesTable).where(and(...conditions));

  const now = new Date();
  const result = rows
    .map(r => ({
      id: r.id,
      org_name: r.org_name,
      category: r.category,
      description: r.description,
      address: r.address,
      lat: r.latitude!,
      lng: r.longitude!,
      phone: r.phone,
      url: r.url,
      open_status: computeOpenStatus(r.open_hours, now),
      distance_miles: distanceMiles(lat, lng, r.latitude!, r.longitude!),
    }))
    .filter(r => r.distance_miles <= radius)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, 100);

  await cacheSet(cacheKey, result, CIVIC_GEO_TTL);
  return res.json(result);
});

// POST /civic/suggestions — community-submitted resource suggestions (§3.3.2)
// BUG FIX: this route previously only logged the suggestion and told the user
// it would be reviewed, without ever writing to the database — every
// submission was silently discarded. civicSuggestionsTable already existed
// (with a comment anticipating this exact admin review route) but was never
// wired up. Now actually persists, and the admin routes below make the
// review queue real.
// Security: requireAuth prevents anonymous actors from spamming the review queue.
router.post("/civic/suggestions", requireAuth, generalApiLimiter, async (req, res) => {
  const { name, category, description, phone, website } = req.body as {
    name?: string; category?: string; description?: string; phone?: string; website?: string;
  };
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });

  try {
    const [row] = await db.insert(civicSuggestionsTable).values({
      name: name.trim(),
      category: category?.trim() || null,
      description: description?.trim() || null,
      phone: phone?.trim() || null,
      website: website?.trim() || null,
      status: "pending",
    }).returning();

    logger.info({ id: row?.id, name, category }, "civic resource suggestion saved");
    return res.json({ ok: true, message: "Thank you — your suggestion will be reviewed by the Niakofa team." });
  } catch (err) {
    logger.error({ err, name, category }, "civic: failed to save suggestion");
    return res.status(500).json({ error: "Failed to save suggestion" });
  }
});

const validStatuses = ["pending", "approved", "dismissed"] as const;

// GET /admin/civic-suggestions — review queue, mirrors region-crisis-resources pagination pattern
router.get("/admin/civic-suggestions", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const statusParam = req.query.status as string | undefined;
  const limitRaw = parseInt(req.query.limit as string ?? "50", 10);
  const offsetRaw = parseInt(req.query.offset as string ?? "0", 10);
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 200);
  const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

  if (statusParam !== undefined && !validStatuses.includes(statusParam as typeof validStatuses[number])) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
  }

  const rows = statusParam
    ? await db.select().from(civicSuggestionsTable)
        .where(eq(civicSuggestionsTable.status, statusParam))
        .limit(limit).offset(offset)
    : await db.select().from(civicSuggestionsTable).limit(limit).offset(offset);
  return res.json(rows);
});

// ── CIVIC PORTAL — county/gov sponsor self-serve request dispatch ─────────────
//
// POST /civic/portal/requests
//   Authenticated user with an APPROVED gov-sponsor record posts a community
//   need. Creates a standard help_request tagged with government_sponsor_id so
//   it flows through the normal claim/complete pipeline. The platform uses the
//   sponsor entity's location (county + state) but the request lat/lng must be
//   supplied by the client (e.g. from the device GPS or a geocoded address).
//
// GET /civic/portal/requests
//   Lists all help_requests previously posted by this sponsor (by gov_sponsor_id).
//
// Both routes require auth + an approved gov-sponsor record.

router.post("/civic/portal/requests", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;

  // 1. Verify the caller has an approved gov-sponsor record
  const [sponsor] = await db
    .select({ id: governmentSponsorsTable.id, entity_name: governmentSponsorsTable.entity_name })
    .from(governmentSponsorsTable)
    .where(
      and(
        eq(governmentSponsorsTable.submitted_by_user_id, userId),
        eq(governmentSponsorsTable.approval_status, "approved"),
      ),
    )
    .limit(1);

  if (!sponsor) {
    return res.status(403).json({
      error: "You must have an approved government sponsor account to post civic requests.",
    });
  }

  const {
    title, description, category, urgency, neighborhood,
    lat, lng, estimated_hours,
  } = req.body as {
    title?: string; description?: string; category?: string; urgency?: string;
    neighborhood?: string; lat?: number; lng?: number; estimated_hours?: number;
  };

  if (!title?.trim()) return res.status(400).json({ error: "title is required." });

  // lat/lng: fall back to 32.7555 / -97.3308 (Fort Worth, TX — platform home base)
  // if the client doesn't supply coordinates. Helpers nearby will still see it on the map.
  const resolvedLat = typeof lat === "number" && isFinite(lat) ? lat : 32.7555;
  const resolvedLng = typeof lng === "number" && isFinite(lng) ? lng : -97.3308;

  const [created] = await db.insert(requestsTable).values({
    title: title.trim(),
    description: description?.trim() || null,
    category: (category?.trim() || "other").toLowerCase().replace(/\s+/g, "_"),
    urgency: urgency ?? "medium",
    status: "open",
    payment_type: "pay_it_forward",
    requester_id: userId,
    lat: resolvedLat,
    lng: resolvedLng,
    neighborhood: neighborhood?.trim() || null,
    government_sponsor_id: sponsor.id,
    estimated_hours: typeof estimated_hours === "number" && estimated_hours > 0 ? estimated_hours : null,
    moderation_status: "approved", // gov-sponsor requests bypass heuristic moderation
  } as typeof requestsTable.$inferInsert).returning();

  logger.info(
    { request_id: created.id, gov_sponsor_id: sponsor.id, entity: sponsor.entity_name, title: created.title },
    "civic-portal: community need posted",
  );

  return res.status(201).json(created);
});

router.get("/civic/portal/requests", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;

  // Verify approved sponsor
  const [sponsor] = await db
    .select({ id: governmentSponsorsTable.id })
    .from(governmentSponsorsTable)
    .where(
      and(
        eq(governmentSponsorsTable.submitted_by_user_id, userId),
        eq(governmentSponsorsTable.approval_status, "approved"),
      ),
    )
    .limit(1);

  if (!sponsor) {
    return res.status(403).json({
      error: "You must have an approved government sponsor account to view civic requests.",
    });
  }

  const rows = await db
    .select({
      id: requestsTable.id,
      title: requestsTable.title,
      description: requestsTable.description,
      category: requestsTable.category,
      urgency: requestsTable.urgency,
      status: requestsTable.status,
      neighborhood: requestsTable.neighborhood,
      estimated_hours: requestsTable.estimated_hours,
      created_at: requestsTable.created_at,
      claimed_at: requestsTable.claimed_at,
      completed_at: requestsTable.completed_at,
      cancelled_at: requestsTable.cancelled_at,
    })
    .from(requestsTable)
    .where(eq(requestsTable.government_sponsor_id, sponsor.id))
    .orderBy(desc(requestsTable.created_at))
    .limit(100);

  return res.json(rows);
});

// GET /admin/civic/portal/requests — all civic requests across all sponsors (admin view)
// Returns each request joined with its sponsor's entity_name, county, state.
// Supports ?status=open|claimed|completed|cancelled&limit=100&offset=0
router.get("/admin/civic/portal/requests", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const statusParam = req.query.status as string | undefined;
  const limitRaw = parseInt(req.query.limit as string ?? "100", 10);
  const offsetRaw = parseInt(req.query.offset as string ?? "0", 10);
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 100 : Math.min(limitRaw, 500);
  const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

  const VALID_STATUSES = ["open", "claimed", "completed", "cancelled"];
  if (statusParam && !VALID_STATUSES.includes(statusParam)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  const baseQuery = db
    .select({
      id: requestsTable.id,
      title: requestsTable.title,
      description: requestsTable.description,
      category: requestsTable.category,
      urgency: requestsTable.urgency,
      status: requestsTable.status,
      neighborhood: requestsTable.neighborhood,
      estimated_hours: requestsTable.estimated_hours,
      created_at: requestsTable.created_at,
      claimed_at: requestsTable.claimed_at,
      completed_at: requestsTable.completed_at,
      cancelled_at: requestsTable.cancelled_at,
      government_sponsor_id: requestsTable.government_sponsor_id,
      sponsor_entity_name: governmentSponsorsTable.entity_name,
      sponsor_county: governmentSponsorsTable.county,
      sponsor_state: governmentSponsorsTable.state,
    })
    .from(requestsTable)
    // leftJoin, not innerJoin: if the sponsoring entity's record was ever removed,
    // an innerJoin would silently drop the sponsored request from this queue —
    // the request must stay visible with a null sponsor rather than vanish.
    .leftJoin(
      governmentSponsorsTable,
      eq(requestsTable.government_sponsor_id, governmentSponsorsTable.id),
    );

  const rows = statusParam
    ? await baseQuery
        .where(eq(requestsTable.status, statusParam))
        .orderBy(desc(requestsTable.created_at))
        .limit(limit)
        .offset(offset)
    : await baseQuery
        .orderBy(desc(requestsTable.created_at))
        .limit(limit)
        .offset(offset);

  return res.json(rows);
});

// PATCH /admin/civic-suggestions/:id — approve/dismiss a suggestion
router.patch("/admin/civic-suggestions/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const r = req as typeof req & { authenticatedUserId?: number };
  const { status, admin_notes } = req.body as { status?: string; admin_notes?: string };

  if (status !== undefined && !validStatuses.includes(status as typeof validStatuses[number])) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
  }

  const [updated] = await db.update(civicSuggestionsTable)
    .set({
      ...(status !== undefined ? { status } : {}),
      ...(admin_notes !== undefined ? { admin_notes } : {}),
      ...(status !== undefined ? { reviewed_by: r.authenticatedUserId ?? null, reviewed_at: new Date() } : {}),
    })
    .where(eq(civicSuggestionsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── COUNTY MARKETPLACE — counties browse open community requests ──────────────
//
// GET /civic/portal/open-requests
//   Approved gov-sponsors can browse ALL open help requests in their county
//   (county matched against their sponsor record). This closes the "one-way"
//   marketplace gap — counties could fund the pool but couldn't see WHERE the
//   need is or claim specific requests. They still cannot claim requests
//   directly (that goes through the normal volunteer pipeline), but they can
//   see them, sort by urgency, and use the data to decide where to direct
//   pool contributions or post their own civic needs.
//
//   Returns: open requests enriched with category + urgency, NOT including PII
//   (no requester name/contact beyond what the public listing would show).

router.get("/civic/portal/open-requests", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;

  // Verify approved sponsor
  const [sponsor] = await db
    .select({
      id: governmentSponsorsTable.id,
      entity_name: governmentSponsorsTable.entity_name,
      county: governmentSponsorsTable.county,
      state: governmentSponsorsTable.state,
    })
    .from(governmentSponsorsTable)
    .where(
      and(
        eq(governmentSponsorsTable.submitted_by_user_id, userId),
        eq(governmentSponsorsTable.approval_status, "approved"),
      ),
    )
    .limit(1);

  if (!sponsor) {
    return res.status(403).json({
      error: "You must have an approved government sponsor account to browse community requests.",
    });
  }

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const urgencyFilter = req.query.urgency as string | undefined;
  const categoryFilter = req.query.category as string | undefined;

  const VALID_URGENCIES = ["low", "medium", "high", "emergency"];
  if (urgencyFilter && !VALID_URGENCIES.includes(urgencyFilter)) {
    return res.status(400).json({ error: `urgency must be one of: ${VALID_URGENCIES.join(", ")}` });
  }

  // COUNTY SCOPE: Find all communities whose name contains the sponsor's
  // county name (case-insensitive). This is the MVP matching heuristic — a
  // full geographic-boundary join awaits a county column on communitiesTable.
  // If no matching community is found, we return an empty result rather than
  // exposing requests from other counties (fail-closed on scope).
  const matchingCommunities = await db
    .select({ id: communitiesTable.id, name: communitiesTable.name })
    .from(communitiesTable)
    .where(sql`LOWER(${communitiesTable.name}) LIKE LOWER(${"%" + sponsor.county + "%"})`);

  if (matchingCommunities.length === 0) {
    return res.json({
      requests: [],
      sponsor: { entity_name: sponsor.entity_name, county: sponsor.county, state: sponsor.state },
      scope_note: `No communities linked to ${sponsor.county} county yet. Contact the Niakofa team to associate your county with a community pool.`,
      limit,
      offset,
    });
  }

  const communityIds = matchingCommunities.map(c => c.id);

  // SCOPE: requestsTable has no community_id column — geographic scoping is via
  // the requester's user record (users.community_id → communitiesTable.name →
  // sponsor county match). This join is the authoritative MVP scope gate:
  // only requests whose requester belongs to a county-matched community are
  // returned. Requests by users with no community_id are excluded (fail-closed).
  // Use sql.join to produce a fully-parameterized ANY(ARRAY[$1,$2,...]) so
  // Postgres never sees the IDs as raw SQL text — even though communityIds is
  // a list of DB-origin integers, parameterizing is the right habit.
  const communityIdPlaceholders = sql.join(communityIds.map(id => sql`${id}`), sql`, `);
  const baseConditions = [
    eq(requestsTable.status, "open"),
    // County scope: requester's community must be in the matched community list
    sql`${requestsTable.requester_id} IN (
      SELECT id FROM users
      WHERE community_id = ANY(ARRAY[${communityIdPlaceholders}]::int[])
    )`,
  ];
  if (urgencyFilter) baseConditions.push(eq(requestsTable.urgency, urgencyFilter));
  if (categoryFilter) baseConditions.push(eq(requestsTable.category, categoryFilter));

  const rows = await db
    .select({
      id:              requestsTable.id,
      title:           requestsTable.title,
      description:     requestsTable.description,
      category:        requestsTable.category,
      urgency:         requestsTable.urgency,
      payment_type:    requestsTable.payment_type,
      neighborhood:    requestsTable.neighborhood,
      estimated_hours: requestsTable.estimated_hours,
      created_at:      requestsTable.created_at,
      // Fuzzed coordinates only — same privacy rule as public map view
      lat: requestsTable.lat,
      lng: requestsTable.lng,
    })
    .from(requestsTable)
    .where(and(...baseConditions))
    .orderBy(
      // Emergency first, then high, medium, low; then newest first within each tier
      desc(requestsTable.urgency),
      desc(requestsTable.created_at),
    )
    .limit(limit)
    .offset(offset);

  // Apply the same coordinate fuzzing used by the public map (~100m radius)
  // so requester location privacy is maintained even for gov-sponsor viewers.
  const fuzzed = rows.map(r => ({
    ...r,
    lat: r.lat != null ? Math.round(r.lat * 1000) / 1000 : null,
    lng: r.lng != null ? Math.round(r.lng * 1000) / 1000 : null,
  }));

  logger.info(
    { gov_sponsor_id: sponsor.id, entity: sponsor.entity_name, count: fuzzed.length },
    "civic-portal: sponsor browsed open community requests",
  );

  return res.json({
    requests: fuzzed,
    sponsor: { entity_name: sponsor.entity_name, county: sponsor.county, state: sponsor.state },
    limit,
    offset,
  });
});

// ── CIVIC NEEDS — two-way portal, migration 0057 ───────────────────────────
//
// Previously gov-sponsors could only FUND the pool (one-way). This closes
// the gap: sponsors post a specific need, any authenticated user/business
// claims it, marks it complete, and a NET30 invoice is generated for the
// sponsor to pay. Lifecycle: open → claimed → completed (+ invoice) | cancelled.

// POST /civic/needs — gov-sponsor posts a community need
router.post("/civic/needs", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sponsor = await getApprovedSponsor(userId);
  if (!sponsor) {
    return res.status(403).json({ error: "You must have an approved government sponsor account to post civic needs." });
  }

  const { title, description, category, estimated_cost, due_date } = req.body as {
    title?: string; description?: string; category?: string;
    estimated_cost?: number; due_date?: string;
  };
  if (!title?.trim()) return res.status(400).json({ error: "title is required." });

  const normalizedCategory = (category?.trim() || "other").toLowerCase().replace(/\s+/g, "_");
  if (!VALID_CIVIC_NEED_CATEGORIES.includes(normalizedCategory)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CIVIC_NEED_CATEGORIES.join(", ")}` });
  }
  if (estimated_cost !== undefined && (typeof estimated_cost !== "number" || estimated_cost < 0)) {
    return res.status(400).json({ error: "estimated_cost must be a non-negative number." });
  }
  let dueDateValue: string | null = null;
  if (due_date !== undefined) {
    const parsed = new Date(due_date);
    if (isNaN(parsed.getTime())) return res.status(400).json({ error: "due_date is not a valid date." });
    dueDateValue = parsed.toISOString().slice(0, 10);
  }

  const [created] = await db.insert(civicNeedsTable).values({
    posted_by_user_id: userId,
    government_sponsor_id: sponsor.id,
    title: title.trim(),
    description: description?.trim() || null,
    category: normalizedCategory,
    estimated_cost: estimated_cost !== undefined ? String(estimated_cost) : null,
    due_date: dueDateValue,
    status: "open",
  }).returning();

  logger.info({ civic_need_id: created.id, gov_sponsor_id: sponsor.id, title: created.title }, "civic-needs: need posted");

  // Best-effort map-pin geocode — fire-and-forget so a slow/unavailable
  // Mapbox call never blocks the sponsor's post from succeeding. Falls back
  // to lazy resolution on first /civic/needs/nearby read if this fails.
  resolveNeedCoords(created.id, { city: sponsor.city, county: sponsor.county, state: sponsor.state }).catch((err) => {
    logger.warn({ err, civic_need_id: created.id }, "civic-needs: failed to geocode need at creation");
  });

  return res.status(201).json(created);
});

// GET /civic/needs — public/authenticated browse of open civic needs (helpers/businesses looking to claim)
router.get("/civic/needs", requireAuth, generalApiLimiter, async (req, res) => {
  const statusParam = (req.query.status as string | undefined) ?? "open";
  const VALID_STATUSES = ["open", "claimed", "completed", "cancelled"];
  if (!VALID_STATUSES.includes(statusParam)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  const rows = await db
    .select({
      id: civicNeedsTable.id,
      title: civicNeedsTable.title,
      description: civicNeedsTable.description,
      category: civicNeedsTable.category,
      estimated_cost: civicNeedsTable.estimated_cost,
      due_date: civicNeedsTable.due_date,
      status: civicNeedsTable.status,
      claimed_by_user_id: civicNeedsTable.claimed_by_user_id,
      claimed_at: civicNeedsTable.claimed_at,
      completed_at: civicNeedsTable.completed_at,
      created_at: civicNeedsTable.created_at,
      sponsor_entity_name: governmentSponsorsTable.entity_name,
      sponsor_county: governmentSponsorsTable.county,
      sponsor_state: governmentSponsorsTable.state,
    })
    .from(civicNeedsTable)
    .innerJoin(governmentSponsorsTable, eq(civicNeedsTable.government_sponsor_id, governmentSponsorsTable.id))
    .where(eq(civicNeedsTable.status, statusParam))
    .orderBy(desc(civicNeedsTable.created_at))
    .limit(limit)
    .offset(offset);

  return res.json(rows);
});

// GET /civic/needs/nearby?lat=&lng=&radius_miles= — open civic needs plottable on the map.
//
// Needs are geocoded lazily: any open need whose lat/lng is still null (never
// resolved at creation, or created before this feature) gets resolved here
// on read and persisted, so it appears on subsequent calls without
// re-geocoding. requireAuth like the other /civic/needs routes — this is a
// dispatch surface for helpers/businesses looking to claim, not a public page.
router.get("/civic/needs/nearby", requireAuth, generalApiLimiter, async (req, res) => {
  const parsed = GetCivicNeedsNearbyQueryParams.safeParse({
    lat: req.query.lat !== undefined ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng !== undefined ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles !== undefined ? parseFloat(req.query.radius_miles as string) : undefined,
  });
  if (
    !parsed.success ||
    !isValidCoordinate(parsed.data.lat, parsed.data.lng)
  ) {
    return res.status(400).json({ error: "lat and lng must be valid geographic coordinates" });
  }
  const { lat, lng } = parsed.data;
  const radius = Math.min(100, Math.max(0.1, parsed.data.radius_miles));

  const openNeeds = await db
    .select({
      id: civicNeedsTable.id,
      title: civicNeedsTable.title,
      category: civicNeedsTable.category,
      status: civicNeedsTable.status,
      estimated_cost: civicNeedsTable.estimated_cost,
      due_date: civicNeedsTable.due_date,
      lat: civicNeedsTable.lat,
      lng: civicNeedsTable.lng,
      sponsor_entity_name: governmentSponsorsTable.entity_name,
      sponsor_city: governmentSponsorsTable.city,
      sponsor_county: governmentSponsorsTable.county,
      sponsor_state: governmentSponsorsTable.state,
    })
    .from(civicNeedsTable)
    .innerJoin(governmentSponsorsTable, eq(civicNeedsTable.government_sponsor_id, governmentSponsorsTable.id))
    .where(eq(civicNeedsTable.status, "open"))
    .limit(300);

  // Lazily resolve any missing coordinates in parallel, then fold the
  // resolved values back onto the in-memory rows (resolveNeedCoords already
  // persists to the DB — no extra write needed here).
  const unresolved = openNeeds.filter(n => n.lat == null || n.lng == null);
  if (unresolved.length > 0) {
    const resolved = await Promise.all(
      unresolved.map(n => resolveNeedCoords(n.id, { city: n.sponsor_city, county: n.sponsor_county, state: n.sponsor_state })),
    );
    unresolved.forEach((n, i) => {
      const coords = resolved[i];
      if (coords) {
        n.lat = coords.lat;
        n.lng = coords.lng;
      }
    });
  }

  const result = openNeeds
    .filter(n => n.lat != null && n.lng != null)
    .map(n => ({
      id: n.id,
      title: n.title,
      category: n.category,
      status: n.status,
      estimated_cost: n.estimated_cost,
      due_date: n.due_date,
      lat: n.lat!,
      lng: n.lng!,
      sponsor_entity_name: n.sponsor_entity_name,
      distance_miles: distanceMiles(lat, lng, n.lat!, n.lng!),
    }))
    .filter(n => n.distance_miles <= radius)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, 100);

  return res.json(result);
});

// PATCH /civic/needs/:id/claim — any authenticated user/business claims an open need
router.patch("/civic/needs/:id/claim", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  // Atomic status guard — WHERE status='open' prevents a claim race.
  const [claimed] = await db.update(civicNeedsTable)
    .set({ status: "claimed", claimed_by_user_id: userId, claimed_at: new Date(), updated_at: new Date() })
    .where(and(eq(civicNeedsTable.id, id), eq(civicNeedsTable.status, "open")))
    .returning();

  if (!claimed) {
    return res.status(409).json({ error: "This need is no longer open (already claimed, completed, or cancelled)." });
  }

  logger.info({ civic_need_id: id, claimed_by_user_id: userId }, "civic-needs: need claimed");

  // Alert the sponsor the instant their posted need is claimed — push with
  // email fallback via the standard sendPushToUser pipeline (task_accepted
  // notifType, same gate as helper-claims-request notifications).
  notifySponsorOfClaim(claimed.id, claimed.government_sponsor_id, claimed.title, userId).catch((err) => {
    logger.error({ err, civic_need_id: id }, "civic-needs: failed to notify sponsor of claim");
  });

  return res.json(claimed);
});

/** Best-effort push+email alert to the sponsor's account when their posted need gets claimed. */
async function notifySponsorOfClaim(
  needId: number,
  govSponsorId: number,
  needTitle: string,
  claimedByUserId: number,
) {
  const [sponsor] = await db
    .select({
      submitted_by_user_id: governmentSponsorsTable.submitted_by_user_id,
      contact_email: governmentSponsorsTable.contact_email,
      entity_name: governmentSponsorsTable.entity_name,
    })
    .from(governmentSponsorsTable)
    .where(eq(governmentSponsorsTable.id, govSponsorId))
    .limit(1);
  if (!sponsor) return;

  const [claimer] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, claimedByUserId))
    .limit(1);
  const claimerName = claimer?.name ?? "A community helper";

  await sendPushToUser(
    sponsor.submitted_by_user_id,
    {
      title: "Your civic need was claimed! 🎉",
      body: `${claimerName} claimed "${needTitle}" (need #${needId}). You'll receive a NET30 invoice once it's completed.`,
      notifType: "task_accepted",
    },
    {
      fallbackEmail: sponsor.contact_email,
      fallbackEmailSubject: `${sponsor.entity_name}: your civic need was claimed`,
    },
  );
}

// PATCH /civic/needs/:id/complete — claimant marks the need fulfilled; generates a NET30 invoice
router.patch("/civic/needs/:id/complete", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { final_cost } = req.body as { final_cost?: number };
  if (final_cost !== undefined && (typeof final_cost !== "number" || final_cost < 0)) {
    return res.status(400).json({ error: "final_cost must be a non-negative number." });
  }

  const result = await db.transaction(async (tx) => {
    // Only the claimant can mark it complete; guard is atomic on status+claimant.
    const [completed] = await tx.update(civicNeedsTable)
      .set({ status: "completed", completed_at: new Date(), updated_at: new Date() })
      .where(and(
        eq(civicNeedsTable.id, id),
        eq(civicNeedsTable.status, "claimed"),
        eq(civicNeedsTable.claimed_by_user_id, userId),
      ))
      .returning();

    if (!completed) return null;

    const amount = final_cost !== undefined
      ? final_cost
      : (completed.estimated_cost !== null ? Number(completed.estimated_cost) : 0);

    // NET30: due 30 days from completion.
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const [invoice] = await tx.insert(civicInvoicesTable).values({
      civic_need_id: completed.id,
      amount: String(amount),
      due_date: dueDate.toISOString().slice(0, 10),
      status: "pending",
      notes: `NET30 invoice for civic need #${completed.id}: ${completed.title}`,
    }).returning();

    return { need: completed, invoice };
  });

  if (!result) {
    return res.status(409).json({ error: "This need is not claimed by you (or is already completed/cancelled)." });
  }

  logger.info(
    { civic_need_id: result.need.id, invoice_id: result.invoice.id, amount: result.invoice.amount, due_date: result.invoice.due_date },
    "civic-needs: need completed, NET30 invoice generated",
  );

  // Alert the sponsor that their need is done and an invoice is waiting.
  notifySponsorOfCompletion(result.need.government_sponsor_id, result.need.title, result.invoice).catch((err) => {
    logger.error({ err, civic_need_id: id }, "civic-needs: failed to notify sponsor of completion");
  });

  return res.json(result);
});

/** Best-effort push+email alert to the sponsor when their need is completed and invoiced. */
async function notifySponsorOfCompletion(
  govSponsorId: number,
  needTitle: string,
  invoice: { id: number; amount: string; due_date: string },
) {
  const [sponsor] = await db
    .select({
      submitted_by_user_id: governmentSponsorsTable.submitted_by_user_id,
      contact_email: governmentSponsorsTable.contact_email,
      entity_name: governmentSponsorsTable.entity_name,
    })
    .from(governmentSponsorsTable)
    .where(eq(governmentSponsorsTable.id, govSponsorId))
    .limit(1);
  if (!sponsor) return;

  const dueDateLabel = new Date(invoice.due_date).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  await sendPushToUser(
    sponsor.submitted_by_user_id,
    {
      title: "Civic need completed ✅",
      body: `"${needTitle}" is done. A NET30 invoice for $${Number(invoice.amount).toFixed(2)} is due ${dueDateLabel}.`,
      notifType: "task_accepted",
    },
    {
      fallbackEmail: sponsor.contact_email,
      fallbackEmailSubject: `${sponsor.entity_name}: civic need completed — invoice due ${dueDateLabel}`,
    },
  );
}

// PATCH /civic/needs/:id/cancel — poster (sponsor) or admin cancels an open/claimed need
router.patch("/civic/needs/:id/cancel", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [need] = await db.select().from(civicNeedsTable).where(eq(civicNeedsTable.id, id)).limit(1);
  if (!need) return res.status(404).json({ error: "Not found" });
  if (need.posted_by_user_id !== userId) {
    return res.status(403).json({ error: "Only the sponsor who posted this need can cancel it." });
  }

  const [cancelled] = await db.update(civicNeedsTable)
    .set({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() })
    .where(and(eq(civicNeedsTable.id, id), sql`${civicNeedsTable.status} IN ('open', 'claimed')`))
    .returning();

  if (!cancelled) return res.status(409).json({ error: "This need is already completed or cancelled." });

  logger.info({ civic_need_id: id }, "civic-needs: need cancelled by sponsor");
  return res.json(cancelled);
});

// GET /civic/needs/mine — sponsor's own posted needs (any status)
router.get("/civic/needs/mine", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sponsor = await getApprovedSponsor(userId);
  if (!sponsor) {
    return res.status(403).json({ error: "You must have an approved government sponsor account." });
  }

  const rows = await db
    .select()
    .from(civicNeedsTable)
    .where(eq(civicNeedsTable.government_sponsor_id, sponsor.id))
    .orderBy(desc(civicNeedsTable.created_at))
    .limit(200);

  return res.json(rows);
});

// GET /civic/needs/:id — fetch a single civic need by ID (for navigation page)
// Must be placed AFTER /nearby and /mine to avoid shadowing those routes.
router.get("/civic/needs/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [need] = await db
    .select({
      id: civicNeedsTable.id,
      title: civicNeedsTable.title,
      description: civicNeedsTable.description,
      category: civicNeedsTable.category,
      estimated_cost: civicNeedsTable.estimated_cost,
      due_date: civicNeedsTable.due_date,
      status: civicNeedsTable.status,
      lat: civicNeedsTable.lat,
      lng: civicNeedsTable.lng,
      address: civicNeedsTable.address,
      claimed_by_user_id: civicNeedsTable.claimed_by_user_id,
      claimed_at: civicNeedsTable.claimed_at,
      completed_at: civicNeedsTable.completed_at,
      created_at: civicNeedsTable.created_at,
      sponsor_entity_name: governmentSponsorsTable.entity_name,
    })
    .from(civicNeedsTable)
    .innerJoin(governmentSponsorsTable, eq(civicNeedsTable.government_sponsor_id, governmentSponsorsTable.id))
    .where(eq(civicNeedsTable.id, id))
    .limit(1);

  if (!need) return res.status(404).json({ error: "Civic need not found" });
  return res.json(need);
});

// GET /civic/needs/:id/invoices — sponsor or claimant views invoices for a need
router.get("/civic/needs/:id/invoices", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [need] = await db.select().from(civicNeedsTable).where(eq(civicNeedsTable.id, id)).limit(1);
  if (!need) return res.status(404).json({ error: "Not found" });

  const isSponsorPoster = need.posted_by_user_id === userId;
  const isClaimant = need.claimed_by_user_id === userId;
  if (!isSponsorPoster && !isClaimant) {
    return res.status(403).json({ error: "You do not have access to this need's invoices." });
  }

  const invoices = await db.select().from(civicInvoicesTable).where(eq(civicInvoicesTable.civic_need_id, id));
  return res.json(invoices);
});

// PATCH /civic/needs/:id/invoice/:invoiceId/pay — admin-only manual mark-paid
// (Full Stripe Connect institutional billing would plug in here later.)
router.patch("/civic/needs/:id/invoice/:invoiceId/pay", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const needId = parseInt(req.params.id as string, 10);
  const invoiceId = parseInt(req.params.invoiceId as string, 10);
  if (isNaN(needId) || isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });

  const [paid] = await db.update(civicInvoicesTable)
    .set({ status: "paid", paid_at: new Date(), paid_by_user_id: userId, updated_at: new Date() })
    .where(and(
      eq(civicInvoicesTable.id, invoiceId),
      eq(civicInvoicesTable.civic_need_id, needId),
      eq(civicInvoicesTable.status, "pending"),
    ))
    .returning();

  if (!paid) return res.status(409).json({ error: "Invoice not found, or already paid." });

  logger.info({ civic_need_id: needId, invoice_id: invoiceId, amount: paid.amount }, "civic-needs: invoice marked paid (admin)");
  return res.json(paid);
});

// GET /admin/civic/needs — admin queue of all civic needs across all sponsors
router.get("/admin/civic/needs", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const statusParam = req.query.status as string | undefined;
  const VALID_STATUSES = ["open", "claimed", "completed", "cancelled"];
  if (statusParam && !VALID_STATUSES.includes(statusParam)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  const baseQuery = db
    .select({
      id: civicNeedsTable.id,
      title: civicNeedsTable.title,
      category: civicNeedsTable.category,
      status: civicNeedsTable.status,
      estimated_cost: civicNeedsTable.estimated_cost,
      due_date: civicNeedsTable.due_date,
      created_at: civicNeedsTable.created_at,
      claimed_at: civicNeedsTable.claimed_at,
      completed_at: civicNeedsTable.completed_at,
      sponsor_entity_name: governmentSponsorsTable.entity_name,
    })
    .from(civicNeedsTable)
    .innerJoin(governmentSponsorsTable, eq(civicNeedsTable.government_sponsor_id, governmentSponsorsTable.id));

  const rows = statusParam
    ? await baseQuery.where(eq(civicNeedsTable.status, statusParam)).orderBy(desc(civicNeedsTable.created_at)).limit(limit).offset(offset)
    : await baseQuery.orderBy(desc(civicNeedsTable.created_at)).limit(limit).offset(offset);

  return res.json(rows);
});

// ── ADMIN CIVIC RESOURCES CRUD ─────────────────────────────────────────────
//
// civic_resources (food pantries, shelters, legal aid, etc.) was seed-data
// only — no admin route existed to add/edit/remove entries, so keeping the
// community map's resource layer current required a direct DB edit. These
// four routes give admins full CRUD from the admin UI.
//
// Cache note: /civic/resources and /civic/resources/nearby cache responses
// (civic:all 1hr TTL, civic:loc:*/civic:nearby:* 5min TTL). There's no
// Redis-safe wildcard delete available here (see cache.ts — cacheDel is a
// single-key op, no SCAN), so on write we only invalidate the exact "civic:all"
// key; the per-location and per-viewport caches simply expire on their own
// short TTLs. Acceptable: this mirrors how other region-cached routes in this
// file already trade a few minutes of staleness for not needing a pattern-scan.

function normalizeResourceInput(body: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => {
    const s = str(v);
    return s.length > 0 ? s : null;
  };
  const numOrNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined; // undefined marks "invalid, not just absent"
  };

  return {
    state: str(body.state).toUpperCase(),
    county: str(body.county),
    city: strOrNull(body.city),
    org_name: str(body.org_name),
    description: strOrNull(body.description),
    url: (() => {
      try {
        const parsed = new URL(str(body.url));
        return parsed.protocol === "http:" || parsed.protocol === "https:"
          ? parsed.toString()
          : "";
      } catch {
        return "";
      }
    })(),
    phone: strOrNull(body.phone),
    category: strOrNull(body.category)?.toLowerCase() ?? null,
    address: strOrNull(body.address),
    latitude: numOrNull(body.latitude),
    longitude: numOrNull(body.longitude),
    open_hours: (() => {
      const raw = strOrNull(body.open_hours);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? JSON.stringify(parsed)
          : null;
      } catch {
        return null;
      }
    })(),
  };
}

// GET /admin/civic/resources?q=&limit=&offset= — full CRUD list, unlike the
// public /civic/resources routes this returns every row (incl. ones with no
// lat/lng yet, which are invisible on the map until geocoded) so admins can
// find and fix incomplete entries.
router.get("/admin/civic/resources", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const rows = q
    ? await db.select().from(civicResourcesTable)
        .where(sql`lower(${civicResourcesTable.org_name}) LIKE ${'%' + q + '%'} OR lower(${civicResourcesTable.city}) LIKE ${'%' + q + '%'} OR lower(${civicResourcesTable.state}) LIKE ${'%' + q + '%'}`)
        .orderBy(desc(civicResourcesTable.updated_at)).limit(limit).offset(offset)
    : await db.select().from(civicResourcesTable)
        .orderBy(desc(civicResourcesTable.updated_at)).limit(limit).offset(offset);

  return res.json({ resources: rows, total: rows.length, limit, offset });
});

// POST /admin/civic/resources — create a new resource. state/county/org_name/url
// required (mirrors the NOT NULL columns); lat/lng optional but must both be
// present (or both absent) to avoid a half-geocoded pin.
router.post("/admin/civic/resources", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const input = normalizeResourceInput(req.body ?? {});

  if (!input.state) return res.status(400).json({ error: "state is required" });
  if (!input.county) return res.status(400).json({ error: "county is required" });
  if (!input.org_name) return res.status(400).json({ error: "org_name is required" });
  if (!input.url) return res.status(400).json({ error: "url is required" });
  if (input.latitude === undefined || input.longitude === undefined) {
    return res.status(400).json({ error: "latitude/longitude must be valid numbers if provided" });
  }
  if ((input.latitude === null) !== (input.longitude === null)) {
    return res.status(400).json({ error: "latitude and longitude must be provided together" });
  }
  if (input.latitude !== null && input.longitude !== null &&
      !isValidCoordinate(input.latitude, input.longitude)) {
    return res.status(400).json({ error: "latitude/longitude are outside valid geographic bounds" });
  }

  try {
    const [row] = await db.insert(civicResourcesTable).values({
      state: input.state,
      county: input.county,
      city: input.city,
      org_name: input.org_name,
      description: input.description,
      url: input.url,
      phone: input.phone,
      category: input.category,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      open_hours: input.open_hours,
    }).returning();

    await cacheDel("civic:all");
    logger.info({ id: row.id, org_name: row.org_name, admin_id: req.authenticatedUserId }, "admin: civic resource created");
    return res.status(201).json(row);
  } catch (err) {
    logger.error({ err }, "admin: failed to create civic resource");
    return res.status(500).json({ error: "Failed to create resource" });
  }
});

// PATCH /admin/civic/resources/:id — partial update, same field-level rules as create.
router.patch("/admin/civic/resources/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db.select().from(civicResourcesTable).where(eq(civicResourcesTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Resource not found" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const merged = normalizeResourceInput({
    state: body.state ?? existing.state,
    county: body.county ?? existing.county,
    city: body.city ?? existing.city,
    org_name: body.org_name ?? existing.org_name,
    description: body.description ?? existing.description,
    url: body.url ?? existing.url,
    phone: body.phone ?? existing.phone,
    category: body.category ?? existing.category,
    address: body.address ?? existing.address,
    latitude: "latitude" in body ? body.latitude : existing.latitude,
    longitude: "longitude" in body ? body.longitude : existing.longitude,
    open_hours: body.open_hours ?? existing.open_hours,
  });

  if (!merged.state) return res.status(400).json({ error: "state is required" });
  if (!merged.county) return res.status(400).json({ error: "county is required" });
  if (!merged.org_name) return res.status(400).json({ error: "org_name is required" });
  if (!merged.url) return res.status(400).json({ error: "url is required" });
  if (merged.latitude === undefined || merged.longitude === undefined) {
    return res.status(400).json({ error: "latitude/longitude must be valid numbers if provided" });
  }
  if ((merged.latitude === null) !== (merged.longitude === null)) {
    return res.status(400).json({ error: "latitude and longitude must be provided together" });
  }
  if (merged.latitude !== null && merged.longitude !== null &&
      !isValidCoordinate(merged.latitude, merged.longitude)) {
    return res.status(400).json({ error: "latitude/longitude are outside valid geographic bounds" });
  }

  try {
    const [row] = await db.update(civicResourcesTable)
      .set({ ...merged, updated_at: new Date() })
      .where(eq(civicResourcesTable.id, id))
      .returning();

    await cacheDel("civic:all");
    logger.info({ id, admin_id: req.authenticatedUserId }, "admin: civic resource updated");
    return res.json(row);
  } catch (err) {
    logger.error({ err, id }, "admin: failed to update civic resource");
    return res.status(500).json({ error: "Failed to update resource" });
  }
});

// DELETE /admin/civic/resources/:id
router.delete("/admin/civic/resources/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const [deleted] = await db.delete(civicResourcesTable).where(eq(civicResourcesTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Resource not found" });

  await cacheDel("civic:all");
  logger.info({ id, admin_id: req.authenticatedUserId }, "admin: civic resource deleted");
  return res.json({ ok: true });
});

// GET /admin/civic/invoices — admin queue of all civic invoices (for NET30 collection tracking)
router.get("/admin/civic/invoices", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const statusParam = (req.query.status as string | undefined) ?? undefined;
  const VALID_STATUSES = ["pending", "paid"];
  if (statusParam && !VALID_STATUSES.includes(statusParam)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  const baseQuery = db
    .select({
      id: civicInvoicesTable.id,
      civic_need_id: civicInvoicesTable.civic_need_id,
      amount: civicInvoicesTable.amount,
      due_date: civicInvoicesTable.due_date,
      status: civicInvoicesTable.status,
      paid_at: civicInvoicesTable.paid_at,
      created_at: civicInvoicesTable.created_at,
      need_title: civicNeedsTable.title,
      sponsor_entity_name: governmentSponsorsTable.entity_name,
    })
    .from(civicInvoicesTable)
    .innerJoin(civicNeedsTable, eq(civicInvoicesTable.civic_need_id, civicNeedsTable.id))
    .innerJoin(governmentSponsorsTable, eq(civicNeedsTable.government_sponsor_id, governmentSponsorsTable.id));

  const rows = statusParam
    ? await baseQuery.where(eq(civicInvoicesTable.status, statusParam)).orderBy(desc(civicInvoicesTable.created_at)).limit(limit).offset(offset)
    : await baseQuery.orderBy(desc(civicInvoicesTable.created_at)).limit(limit).offset(offset);

  return res.json(rows);
});

export default router;
