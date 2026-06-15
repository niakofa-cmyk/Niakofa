import { Router } from "express";
import { db, civicResourcesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// MAPBOX_TOKEN must be set as an environment variable — never hardcoded.
// The server will return a 500 if this is missing rather than silently using
// a committed token that may be rotated or abused.
function getMapboxToken(): string {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_TOKEN environment variable is not set. Set it in Railway → Variables.");
  }
  return token;
}

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
  let token: string;
  try {
    token = getMapboxToken();
  } catch (err) {
    logger.error({ err }, "Mapbox token not configured — reverse geocode skipped");
    return null;
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,district,region&access_token=${token}`;
  try {
    const res = await fetch(url);
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

// GET /civic/resources?lat=X&lng=Y
router.get("/civic/resources", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: "lat and lng query params required" });
  }

  const place = await reverseGeocode(lat, lng);

  if (!place || !place.state_short) {
    const statewide = await db
      .select()
      .from(civicResourcesTable)
      .limit(6);
    return res.json({ resources: statewide, place_name: "your area", match_level: "fallback" });
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

  return res.json({
    resources,
    place_name: place.place_name,
    city: place.city,
    county: place.county ? `${place.county} County` : null,
    state: place.state_short,
    match_level: matchLevel,
  });
});

export default router;
