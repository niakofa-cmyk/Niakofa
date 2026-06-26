import { Router } from "express";
import { db, civicResourcesTable, civicSuggestionsTable } from "@workspace/db";
import { eq, and, or, isNull, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { cacheGet, cacheSet, cacheDel, cacheDelPrefix } from "../lib/cache";
import { civicSuggestionLimiter } from "../middlewares/rate-limit";

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
router.post("/civic/suggestions", civicSuggestionLimiter, async (req, res) => {
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
// BUG-4-M01: Add default LIMIT + pagination so large suggestion tables don't
// return the entire dataset on every admin dashboard load.
router.get("/civic/suggestions", requireAuth, requireAdmin(), async (req, res) => {
  const limitRaw = parseInt(req.query.limit as string ?? "50", 10);
  const offsetRaw = parseInt(req.query.offset as string ?? "0", 10);
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 200);
  const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

  const suggestions = await db.select()
    .from(civicSuggestionsTable)
    .orderBy(desc(civicSuggestionsTable.created_at))
    .limit(limit)
    .offset(offset);
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


// ── POST /civic/seed-farms — idempotent admin seed for local farm resources ───
// Protected by x-admin-token header (ADMIN_SECRET env var).
// Safe to re-run: skips any entry where (org_name, state, county) already exists.
// Call via: curl -X POST https://niakofa.com/api/civic/seed-farms \
//             -H "x-admin-token: $ADMIN_SECRET"
router.post("/civic/seed-farms", async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers["x-admin-token"] !== adminSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const FARMS = [
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Cowtown Farmers Market", description: "Year-round Saturday market featuring local Texas farmers. Accepts SNAP/EBT with Double Up Food Bucks — spend $20 in SNAP, get $20 more on Texas-grown produce. Open Saturdays 8am–12pm.", url: "https://www.cowtownfarmersmarket.com", phone: "(817) 336-5000", category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Milam's Mushrooms", description: "Local Fort Worth area mushroom farm offering fresh gourmet and medicinal mushrooms for direct purchase. Specialty varieties grown sustainably in Tarrant County.", url: "https://www.milamsmushrooms.com", phone: null, category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Texas A&M AgriLife Extension — Tarrant County", description: "Free gardening education, food preservation classes, Master Gardener programs, and urban farming resources for Tarrant County residents.", url: "https://tarrant.agrilife.org", phone: "(817) 884-1945", category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Tarrant County Master Gardeners", description: "Volunteer educators providing research-based gardening information to Tarrant County residents. Offers workshops, plant clinics, and community garden support.", url: "https://tarrantmg.org", phone: "(817) 884-1945", category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Stop Six Community Garden", description: "Community garden serving the historic Stop Six neighborhood in East Fort Worth. Open to neighborhood residents for fresh produce growing. A cornerstone of food sovereignty in one of Fort Worth's most resilient communities.", url: "https://www.fortworthtexas.gov/departments/parks", phone: "(817) 392-5700", category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Haltom City", org_name: "Haltom City Community Garden", description: "Accessible community garden plots near North Fort Worth. Low-cost plot rentals available for families wanting to grow their own food.", url: "https://www.haltomcitytx.com", phone: "(817) 834-6261", category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Presbyterian Night Shelter Garden", description: "On-site garden at Presbyterian Night Shelter producing fresh vegetables for shelter residents. Volunteer opportunities available for community members.", url: "https://www.presbyteriannightshelter.org", phone: "(817) 632-5400", category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Tarrant County Public Library — Seed Library", description: "Free seed lending program at multiple Tarrant County Public Library branches. Check out vegetable, herb, and flower seeds with your library card and grow food at home.", url: "https://www.tarlibrary.org", phone: "(817) 884-1800", category: "local_farm" },
    { state: "TX", county: "Parker", city: "Weatherford", org_name: "Clark Gardens Botanical Park", description: "Seasonal pick-your-own and community events at this 35-acre botanical park near Fort Worth. About 40 minutes west. Features local plant sales and sustainable gardening demonstrations.", url: "https://www.clarkgardens.org", phone: "(940) 682-4856", category: "local_farm" },
    { state: "TX", county: "Dallas", city: "Coppell", org_name: "Coppell Farmers Market", description: "Saturday market featuring verified local Texas producers. Accepts SNAP/EBT. Fresh seasonal produce, eggs, honey, and specialty foods from small farms. About 30 minutes east of Fort Worth.", url: "https://www.coppellfarmersmarket.org", phone: null, category: "local_farm" },
    { state: "TX", county: "Johnson", city: "Cleburne", org_name: "Johnson County Farmers Alliance", description: "Direct farm connections and seasonal produce from Johnson County farms south of Fort Worth. Connects Mansfield, Everman, Crowley and south Tarrant County residents to local food sources.", url: "https://www.jcfarmersalliance.com", phone: null, category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Local Line — Texas Farm Directory", description: "Online platform connecting Fort Worth area families directly to local Texas farms for weekly produce boxes, CSA subscriptions, and direct farm purchases. Search by ZIP code.", url: "https://www.localline.ca/texas", phone: null, category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Double Up Food Bucks Texas", description: "SNAP/EBT matching program at participating farmers markets across Fort Worth. Spend up to $20 in SNAP on Texas-grown fruits and vegetables and receive matching dollars.", url: "https://www.doubleupfoodbuckstexas.org", phone: null, category: "local_farm" },
    { state: "TX", county: "Tarrant", city: "Fort Worth", org_name: "Fort Worth Community Gardens Program", description: "City of Fort Worth Parks & Recreation community garden plot program. Waitlist available for residents wanting to grow their own food across multiple garden sites.", url: "https://www.fortworthtexas.gov/departments/parks/programs/community-garden", phone: "(817) 392-5700", category: "local_farm" },
  ];

  let inserted = 0;
  let skipped = 0;
  const results: string[] = [];

  for (const farm of FARMS) {
    const existing = await db
      .select({ id: civicResourcesTable.id })
      .from(civicResourcesTable)
      .where(and(
        eq(civicResourcesTable.org_name, farm.org_name),
        eq(civicResourcesTable.state, farm.state),
        eq(civicResourcesTable.county, farm.county),
      ))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      results.push(`SKIP: ${farm.org_name}`);
      continue;
    }

    await db.insert(civicResourcesTable).values({
      state: farm.state,
      county: farm.county,
      city: farm.city ?? null,
      org_name: farm.org_name,
      description: farm.description,
      url: farm.url,
      phone: farm.phone ?? null,
      category: farm.category,
    });
    inserted++;
    results.push(`INSERT: ${farm.org_name}`);
  }

  // Bust the civic resources cache so new entries appear immediately
  await cacheDel("civic:all");
  await cacheDelPrefix("civic:loc:");

  logger.info({ inserted, skipped }, "civic farm seed complete");
  return res.json({ ok: true, inserted, skipped, results });
});

export default router;
