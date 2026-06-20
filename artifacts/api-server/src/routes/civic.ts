import { Router } from "express";
import { db, civicResourcesTable, civicSuggestionsTable } from "@workspace/db";
import { eq, and, or, isNull, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { cacheGet, cacheSet, cacheDel, cacheDelPrefix } from "../lib/cache";

const CIVIC_TTL = 3600; // 1 hour — civic resources change rarely

const router = Router();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN ?? "";

interface MapboxFeature {
  place_type: string[];
  text: string;
  place_name: string;
  context?: { id: string; text: string }[];
}

interface MapboxGeocodingResponse {
  features: MapboxFeature[];
}

interface ResolvedPlace {
  city: string | null;
  county: string | null;
  state: string | null;
  state_short: string | null;
  place_name: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,district,region&access_token=${MAPBOX_TOKEN}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout — don't hang the request handler on a slow upstream
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      logger.warn({ status: res.status }, "Mapbox geocoding non-200");
      return null;
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
            const parts = c.text.split(",");
            state = c.text.trim();
            state_short = (parts[parts.length - 1] ?? c.text).trim();
          }
        }
      }

      if (types.includes("district") && !county) {
        county = feature.text.replace(/ County$/i, "").trim();
        for (const c of ctx) {
          if (c.id.startsWith("region.")) {
            const parts = c.text.split(",");
            state_short = (parts[parts.length - 1] ?? c.text).trim();
            state = c.text.trim();
          }
        }
      }

      if (types.includes("region") && !state) {
        const parts = feature.text.split(",");
        state_short = (parts[parts.length - 1] ?? feature.text).trim();
        state = feature.text.trim();
      }
    }

    return { city, county, state_short, state, place_name: place_name || `${city ?? ""}, ${state_short ?? ""}`.trim() };
  } catch (err) {
    logger.warn({ err }, "Mapbox reverse geocode failed");
    return null;
  }
}

// GET /civic/resources?lat=X&lng=Y  (lat/lng are optional — falls back to full list)
router.get("/civic/resources", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng)) {
    const cacheKey = "civic:all";
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);
    const all = await db.select().from(civicResourcesTable).limit(50);
    await cacheSet(cacheKey, all, CIVIC_TTL);
    return res.json(all);
  }

  const latRounded = Math.round(lat * 10) / 10;
  const lngRounded = Math.round(lng * 10) / 10;
  const locationCacheKey = `civic:loc:${latRounded}:${lngRounded}`;
  const locationCached = await cacheGet(locationCacheKey);
  if (locationCached) return res.json(locationCached);

  const place = await reverseGeocode(lat, lng);

  if (!place || !place.state_short) {
    const statewide = await db
      .select()
      .from(civicResourcesTable)
      .limit(6);
    const result = { resources: statewide, place_name: "your area", match_level: "fallback" };
    await cacheSet(locationCacheKey, result, CIVIC_TTL);
    return res.json(result);
  }

  const state = place.state_short.toUpperCase();
  const county = place.county;
  const city = place.city;

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
      );
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
      );
    if (resources.length > 0) matchLevel = "county";
  }

  if (resources.length === 0) {
    resources = await db
      .select()
      .from(civicResourcesTable)
      .where(eq(civicResourcesTable.state, state));
    if (resources.length > 0) matchLevel = "state";
  }

  if (resources.length === 0) {
    resources = await db.select().from(civicResourcesTable).limit(6);
    matchLevel = "fallback";
  }

  logger.info({ lat, lng, state, county, city, matchLevel, count: resources.length }, "civic resources resolved");

  const payload = {
    resources,
    place_name: place.place_name,
    city: place.city,
    county: place.county ? `${place.county} County` : null,
    state: place.state_short,
    match_level: matchLevel,
  };
  await cacheSet(locationCacheKey, payload, CIVIC_TTL);
  return res.json(payload);
});

// POST /civic/suggestions — community-submitted resource suggestions (§3.3.2)
// Persists to DB so admins can review and approve them.
router.post("/civic/suggestions", async (req, res) => {
  const { name, category, description, phone, website } = req.body as {
    name?: string; category?: string; description?: string; phone?: string; website?: string;
  };
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });

  const [suggestion] = await db.insert(civicSuggestionsTable)
    .values({
      name: name.trim(),
      category: category?.trim() ?? null,
      description: description?.trim() ?? null,
      phone: phone?.trim() ?? null,
      website: website?.trim() ?? null,
      status: "pending",
    })
    .returning();

  logger.info({ id: suggestion?.id, name }, "civic resource suggestion stored");
  return res.json({ ok: true, message: "Thank you — your suggestion will be reviewed by the Niakofa team." });
});

// GET /civic/suggestions — admin: list all community-submitted suggestions
router.get("/civic/suggestions", requireAuth, requireAdmin(), async (_req, res) => {
  const suggestions = await db.select()
    .from(civicSuggestionsTable)
    .orderBy(desc(civicSuggestionsTable.created_at));
  return res.json(suggestions);
});

// PATCH /civic/suggestions/:id/review — admin: approve, dismiss, or note a suggestion
router.patch("/civic/suggestions/:id/review", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid suggestion id" });

  const { status, admin_notes } = req.body as { status?: string; admin_notes?: string };
  const validStatuses = ["pending", "approved", "dismissed"];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
  }

  const [updated] = await db.update(civicSuggestionsTable)
    .set({
      ...(status ? { status } : {}),
      ...(admin_notes !== undefined ? { admin_notes } : {}),
      reviewed_by: req.authenticatedUserId!,
      reviewed_at: new Date(),
    })
    .where(eq(civicSuggestionsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Suggestion not found" });
  logger.info({ id, status, reviewed_by: req.authenticatedUserId }, "civic suggestion reviewed");
  if (status === "approved") {
    // Invalidate both the unscoped cache AND every location-specific cache
    // entry — previously only "civic:all" was cleared, so a newly approved
    // resource could stay invisible in location-scoped results for up to
    // an hour.
    await cacheDel("civic:all");
    await cacheDelPrefix("civic:loc:");
  }
  return res.json(updated);
});

export default router;
