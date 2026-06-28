import { Router } from "express";
import { GetRouteQueryParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { navigationLimiter } from "../middlewares/rate-limit";

const router = Router();

const ALLOWED_PROFILES = ["driving", "walking", "cycling"] as const;
type RoutingProfile = (typeof ALLOWED_PROFILES)[number];

// Simple in-process route cache: key → {data, expiresAt}
// TTL: 3 min for driving (traffic changes), 10 min for walking/cycling
const routeCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS: Record<RoutingProfile, number> = {
  driving: 3 * 60 * 1000,
  walking: 10 * 60 * 1000,
  cycling: 10 * 60 * 1000,
};

function getCacheKey(
  start_lat: number, start_lng: number,
  end_lat: number, end_lng: number,
  profile: RoutingProfile
): string {
  // Round to ~11m precision to allow minor GPS jitter to hit cache
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return `${profile}:${r(start_lat)},${r(start_lng)};${r(end_lat)},${r(end_lng)}`;
}

// Aggregate steps across all legs (handles multi-leg routes: ferry + drive, etc.)
function aggregateSteps(
  legs: Array<{
    steps: Array<{
      maneuver: { instruction: string; type: string; modifier?: string };
      distance: number;
      duration: number;
    }>;
  }>
) {
  return legs.flatMap((leg) =>
    leg.steps.map((step) => ({
      instruction: step.maneuver.instruction,
      distance_meters: step.distance,
      duration_seconds: step.duration,
      maneuver_type: step.maneuver.type ?? null,
      maneuver_direction: step.maneuver.modifier ?? null,
    }))
  );
}

// Compute bounding box from geometry coordinates for client camera fitting
function computeBBox(
  coords: number[][]
): [number, number, number, number] | null {
  if (!coords.length) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

router.get("/navigation/route", requireAuth, navigationLimiter, async (req, res) => {
  const parsed = GetRouteQueryParams.safeParse({
    start_lat: parseFloat(req.query.start_lat as string),
    start_lng: parseFloat(req.query.start_lng as string),
    end_lat: parseFloat(req.query.end_lat as string),
    end_lng: parseFloat(req.query.end_lng as string),
  });
  if (!parsed.success)
    return res.status(400).json({ error: "start_lat, start_lng, end_lat, end_lng required" });

  const { start_lat, start_lng, end_lat, end_lng } = parsed.data;

  // Validate and sanitize routing profile — allowlist only
  const rawProfile = req.query.profile as string | undefined;
  const profile: RoutingProfile =
    rawProfile && (ALLOWED_PROFILES as readonly string[]).includes(rawProfile)
      ? (rawProfile as RoutingProfile)
      : "driving";

  // Optional: prefer metric units (km) for walking/cycling if ?units=metric
  const useMetric =
    (req.query.units as string | undefined) === "metric" ||
    profile === "cycling" ||
    profile === "walking";

  const token = process.env.VITE_MAPBOX_TOKEN;
  if (!token) return res.status(500).json({ error: "Mapbox token not configured" });

  // Cache check
  const cacheKey = getCacheKey(start_lat, start_lng, end_lat, end_lng, profile);
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    res.setHeader("X-Route-Cache", "HIT");
    return res.json(cached.data);
  }
  res.setHeader("X-Route-Cache", "MISS");

  try {
    const departAt =
      profile === "driving"
        ? `&depart_at=${new Date().toISOString()}&annotations=congestion`
        : "";
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${start_lng},${start_lat};${end_lng},${end_lat}?steps=true&geometries=geojson&overview=full${departAt}&access_token=${token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = (await response.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { type: string; coordinates: number[][] };
        legs: Array<{
          steps: Array<{
            maneuver: { instruction: string; type: string; modifier?: string };
            distance: number;
            duration: number;
          }>;
          distance: number;
          duration: number;
        }>;
      }>;
    };

    if (!data.routes || data.routes.length === 0) {
      return res.status(404).json({ error: "No route found" });
    }

    const route = data.routes[0];
    if (!route.legs || route.legs.length === 0) {
      return res.status(404).json({ error: "Route had no legs — try different coordinates" });
    }

    // Aggregate steps across ALL legs (fix: was only using legs[0])
    const steps = aggregateSteps(route.legs);

    // Human-readable distance
    const distanceMiles = route.distance / 1609.34;
    const distanceKm = route.distance / 1000;
    const distanceText = useMetric
      ? `${distanceKm.toFixed(1)} km`
      : `${distanceMiles.toFixed(1)} mi`;

    // ETA text
    const durationMin = Math.round(route.duration / 60);
    const etaText =
      durationMin < 60
        ? `${durationMin} min`
        : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

    // Initial bearing from start → first waypoint
    const coords = route.geometry.coordinates;
    let initialBearing = 0;
    if (coords.length >= 2) {
      const [lng1, lat1] = coords[0];
      const [lng2, lat2] = coords[1];
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const lat1R = (lat1 * Math.PI) / 180;
      const lat2R = (lat2 * Math.PI) / 180;
      const x = Math.sin(dLng) * Math.cos(lat2R);
      const y =
        Math.cos(lat1R) * Math.sin(lat2R) -
        Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
      initialBearing = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
    }

    // Speed — guard against division by zero (very short routes)
    const speedMph =
      route.duration > 0 ? (distanceMiles / (route.duration / 3600)) : 0;
    const speedKph =
      route.duration > 0 ? (distanceKm / (route.duration / 3600)) : 0;

    // BBox for client camera fitting
    const bbox = computeBBox(coords);

    const result = {
      geometry: route.geometry,
      distance_meters: route.distance,
      duration_seconds: route.duration,
      steps,
      eta_text: etaText,
      distance_text: distanceText,
      initial_bearing: Math.round(initialBearing),
      speed_mph: Math.round(speedMph),
      speed_kph: Math.round(speedKph),
      waypoints: coords.length,
      legs_count: route.legs.length,
      bbox,
      profile,
      units: useMetric ? "metric" : "imperial",
    };

    // Cache the result
    routeCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS[profile],
    });

    // Prune stale cache entries periodically (avoid unbounded growth)
    if (routeCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of routeCache) {
        if (now >= v.expiresAt) routeCache.delete(k);
      }
    }

    return res.json(result);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      logger.warn({ start_lat, start_lng, end_lat, end_lng, profile }, "Mapbox directions timeout");
      return res.status(504).json({ error: "Route request timed out — try again" });
    }
    logger.error({ err }, "Mapbox directions API error");
    return res.status(500).json({ error: "Failed to fetch route" });
  }
});

export default router;
