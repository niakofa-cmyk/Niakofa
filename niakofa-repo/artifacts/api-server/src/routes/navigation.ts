import { Router } from "express";
import { GetRouteQueryParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { navigationLimiter } from "../middlewares/rate-limit";

const router = Router();

const ALLOWED_PROFILES = ["driving", "walking", "cycling"] as const;
type RoutingProfile = (typeof ALLOWED_PROFILES)[number];

// Simple in-process route cache: key → {data, expiresAt}
// TTL: 2 min for driving (short — traffic changes fast), 10 min for walking/cycling
const routeCache = new Map<string, { data: unknown; expiresAt: number }>();

// ── Circuit breaker for Mapbox Directions API ────────────────────────────────
// Prevents cascade failures when Mapbox is experiencing an outage: after
// CB_FAILURE_THRESHOLD consecutive failures (timeouts or 5xx), the circuit opens
// and all requests are rejected immediately with 503 for CB_OPEN_DURATION_MS,
// then moves to "half-open" to probe with a single request.
const CB_FAILURE_THRESHOLD = 5;
const CB_OPEN_DURATION_MS = 30_000; // 30s cool-down before retry
let cbFailures = 0;
let cbOpenUntil = 0;   // epoch ms; 0 = circuit closed

function cbIsOpen(): boolean {
  if (cbOpenUntil === 0) return false;
  if (Date.now() >= cbOpenUntil) {
    // Half-open: allow one probe through; failures re-open immediately
    cbOpenUntil = 0;
    return false;
  }
  return true;
}
function cbRecordSuccess(): void { cbFailures = 0; cbOpenUntil = 0; }
function cbRecordFailure(): void {
  cbFailures++;
  if (cbFailures >= CB_FAILURE_THRESHOLD) {
    cbOpenUntil = Date.now() + CB_OPEN_DURATION_MS;
    logger.warn({ cbFailures, cbOpenUntil }, "navigation circuit breaker: OPEN — Mapbox repeatedly failing");
  }
}

/** Returns a snapshot of the Mapbox circuit breaker state for health reporting. */
export function getNavigationCircuitBreakerStatus(): {
  state: "closed" | "open" | "half_open";
  failures: number;
  open_until_iso: string | null;
} {
  if (cbOpenUntil === 0) {
    return { state: "closed", failures: cbFailures, open_until_iso: null };
  }
  if (Date.now() >= cbOpenUntil) {
    return { state: "half_open", failures: cbFailures, open_until_iso: new Date(cbOpenUntil).toISOString() };
  }
  return { state: "open", failures: cbFailures, open_until_iso: new Date(cbOpenUntil).toISOString() };
}
const CACHE_TTL_MS: Record<RoutingProfile, number> = {
  driving: 2 * 60 * 1000,
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
// voice_instructions[0] is the earliest/longest-range announcement; the LAST entry
// is the closest-approach instruction — use that as the canonical step announcement.
function aggregateSteps(
  legs: Array<{
    steps: Array<{
      maneuver: { instruction: string; type: string; modifier?: string };
      distance: number;
      duration: number;
      voice_instructions?: Array<{ announcement: string; distanceAlongGeometry: number }>;
    }>;
  }>
) {
  return legs.flatMap((leg) =>
    leg.steps.map((step) => {
      // Prefer the most-specific voice announcement (closest-range entry) if available.
      const voiceEntries = step.voice_instructions ?? [];
      const bestAnnouncement = voiceEntries.length > 0
        ? voiceEntries[voiceEntries.length - 1].announcement
        : step.maneuver.instruction;
      return {
        instruction: step.maneuver.instruction,
        voice_announcement: bestAnnouncement,
        distance_meters: step.distance,
        duration_seconds: step.duration,
        maneuver_type: step.maneuver.type ?? null,
        maneuver_direction: step.maneuver.modifier ?? null,
      };
    })
  );
}

// Derive overall traffic severity from the per-segment congestion annotation.
// Uses congestion.length (total segments) as the denominator so that unknown/
// null/other segments don't inflate the share of recognized levels. Returns the
// worst named level that covers >20% of ALL segments; "unknown" if no named
// levels appear at all.
function computeTrafficLevel(
  congestion: string[] | undefined
): "low" | "moderate" | "heavy" | "severe" | "unknown" {
  if (!congestion || congestion.length === 0) return "unknown";
  const total = congestion.length; // denominator = all segments (including unknown/other)
  const counts: Record<string, number> = { low: 0, moderate: 0, heavy: 0, severe: 0 };
  for (const c of congestion) {
    if (c in counts) counts[c]++;
  }
  const knownTotal = Object.values(counts).reduce((s, n) => s + n, 0);
  if (knownTotal === 0) return "unknown";
  for (const level of ["severe", "heavy", "moderate", "low"] as const) {
    if (counts[level] / total > 0.2) return level;
  }
  return "low";
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

  // Helper has arrived (or start/end coincide, e.g. rounding/GPS overlap):
  // Mapbox's Directions API rejects a zero-length request with a 422, which
  // would otherwise surface to the client as a generic "routing unavailable"
  // 502 right at the moment a helper reaches the destination. Short-circuit
  // with a trivial zero-distance route instead of ever calling the upstream API.
  const ARRIVED_THRESHOLD_METERS = 15;
  const metersBetween = (() => {
    const R = 6371000;
    const dLat = ((end_lat - start_lat) * Math.PI) / 180;
    const dLng = ((end_lng - start_lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((start_lat * Math.PI) / 180) *
        Math.cos((end_lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  })();
  if (metersBetween <= ARRIVED_THRESHOLD_METERS) {
    return res.json({
      distance_meters: Math.round(metersBetween),
      duration_seconds: 0,
      geometry: { type: "LineString", coordinates: [[start_lng, start_lat], [end_lng, end_lat]] },
      steps: [],
      traffic_level: "unknown" as const,
      bbox: computeBBox([[start_lng, start_lat], [end_lng, end_lat]]),
      arrived: true,
    });
  }

  // Reject out-of-range coordinates before they reach Mapbox — zod.coerce.number()
  // only rejects NaN, not values outside valid lat/lng bounds.
  const inRange =
    start_lat >= -90 && start_lat <= 90 &&
    end_lat >= -90 && end_lat <= 90 &&
    start_lng >= -180 && start_lng <= 180 &&
    end_lng >= -180 && end_lng <= 180;
  if (!inRange) {
    return res.status(400).json({ error: "Coordinates out of valid range (lat: -90..90, lng: -180..180)" });
  }

  // Validate and sanitize routing profile — allowlist only
  const rawProfile = req.query.profile as string | undefined;
  const profile: RoutingProfile =
    rawProfile && (ALLOWED_PROFILES as readonly string[]).includes(rawProfile)
      ? (rawProfile as RoutingProfile)
      : "driving";

  // Metric vs Imperial: explicit ?units=metric param, or auto for cycling/walking.
  // Driving defaults to metric for non-US/UK/Myanmar locales — the frontend passes
  // ?units=metric when detectUnits() returns "metric" in locale-utils.ts.
  const useMetric =
    (req.query.units as string | undefined) === "metric" ||
    profile === "cycling" ||
    profile === "walking";

  // Navigation language — Mapbox Directions supports a subset of BCP-47 codes.
  // Frontend passes ?lang=<code> from detectMapLanguage(). Unknown codes fall back to "en".
  const MAPBOX_NAV_LANGS = new Set([
    "ar", "de", "en", "es", "fr", "it", "ja", "ko", "nl", "pt", "ru", "sw", "vi", "zh",
  ]);
  const rawLang = ((req.query.lang as string | undefined) ?? "en").toLowerCase().split("-")[0];
  const navLang = MAPBOX_NAV_LANGS.has(rawLang) ? rawLang : "en";

  const voiceUnits = useMetric ? "metric" : "imperial";

  // Accept both MAPBOX_TOKEN (server-only, preferred) and the VITE_ prefixed
  // variant so existing Replit env setups that only set VITE_MAPBOX_TOKEN still
  // work.  Server-side code should never require the VITE_ prefix — that prefix
  // is a Vite build-time convention that inlines values into the client bundle.
  //
  // Using || (not ??) so that an empty-string value (e.g. a placeholder secret
  // the user forgot to fill in) correctly falls through to the next option
  // rather than being treated as a valid token.
  const token = (process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN) || undefined;
  if (!token) {
    logger.warn("navigation: Mapbox token not set — set MAPBOX_TOKEN or VITE_MAPBOX_TOKEN");
    return res.status(503).json({ error: "Navigation service not configured — set MAPBOX_TOKEN in environment secrets" });
  }

  // Cache check — include lang and units in the key so different locales get their own entry
  const cacheKey = `${getCacheKey(start_lat, start_lng, end_lat, end_lng, profile)}:${navLang}:${voiceUnits}`;
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    res.setHeader("X-Route-Cache", "HIT");
    return res.json(cached.data);
  }
  res.setHeader("X-Route-Cache", "MISS");

  // Circuit breaker: reject immediately if Mapbox has been repeatedly failing.
  // Returns 503 with Retry-After header so the client can back off cleanly.
  if (cbIsOpen()) {
    const retryAfterSec = Math.max(1, Math.ceil((cbOpenUntil - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(503).json({ error: "Routing service temporarily unavailable — try again shortly" });
  }

  try {
    // Driving profile: traffic-aware routing + congestion/maxspeed annotations +
    // richer voice instruction text. Language and units are locale-aware.
    const drivingExtras =
      profile === "driving"
        ? `&depart_at=${encodeURIComponent(new Date().toISOString())}&annotations=congestion,maxspeed&voice_instructions=true&voice_units=${voiceUnits}`
        : `&voice_instructions=true&voice_units=${voiceUnits}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${start_lng},${start_lat};${end_lng},${end_lat}?steps=true&geometries=geojson&overview=full${drivingExtras}&language=${navLang}&access_token=${token}`;

    const controller = new AbortController();
    // 12 s — generous enough for slow mobile networks without blocking forever
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error(
        { status: response.status, start_lat, start_lng, end_lat, end_lng, profile },
        "Mapbox directions API returned non-OK status"
      );
      // 5xx from Mapbox counts as an upstream failure toward the circuit breaker.
      // 4xx (bad token / quota) are NOT circuit-breaker events — they're config
      // errors that won't be fixed by backing off from Mapbox.
      if (response.status >= 500) cbRecordFailure();
      // 401/403 = bad/expired token, 429 = quota, 5xx = upstream outage —
      // none of these mean "no route exists," so don't report them as 404.
      const status = response.status === 429 ? 429 : 502;
      return res.status(status).json({
        error: response.status === 429
          ? "Routing service rate-limited — try again shortly"
          : "Routing service unavailable — try again",
      });
    }

    const data = (await response.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { type: string; coordinates: number[][] };
        legs: Array<{
          annotation?: {
            congestion?: string[];
            maxspeed?: Array<{ speed?: number; unit?: string; unknown?: boolean } | null>;
          };
          steps: Array<{
            maneuver: { instruction: string; type: string; modifier?: string };
            distance: number;
            duration: number;
            voice_instructions?: Array<{ announcement: string; distanceAlongGeometry: number }>;
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

    // Aggregate congestion from all legs for the overall traffic summary
    const allCongestion = route.legs.flatMap(l => l.annotation?.congestion ?? []);
    const trafficLevel = computeTrafficLevel(allCongestion);

    // ETA with traffic qualifier
    const trafficSuffix = profile === "driving" && trafficLevel !== "unknown" && trafficLevel !== "low"
      ? ` (${trafficLevel} traffic)`
      : "";

    const result = {
      geometry: route.geometry,
      distance_meters: route.distance,
      duration_seconds: route.duration,
      steps,
      eta_text: etaText + trafficSuffix,
      distance_text: distanceText,
      initial_bearing: Math.round(initialBearing),
      speed_mph: Math.round(speedMph),
      speed_kph: Math.round(speedKph),
      waypoints: coords.length,
      legs_count: route.legs.length,
      bbox,
      profile,
      units: useMetric ? "metric" : "imperial",
      // Traffic intelligence
      traffic_level: trafficLevel,
      congestion_segments: allCongestion.length,
    };

    // Successful Mapbox call — reset circuit breaker failure counter
    cbRecordSuccess();

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
      // Timeout counts as a Mapbox failure toward the circuit breaker —
      // repeated timeouts indicate an upstream problem, not a user error.
      cbRecordFailure();
      logger.warn({ start_lat, start_lng, end_lat, end_lng, profile, cbFailures }, "Mapbox directions timeout");
      return res.status(504).json({ error: "Route request timed out — try again" });
    }
    cbRecordFailure();
    logger.error({ err }, "Mapbox directions API error");
    return res.status(500).json({ error: "Failed to fetch route" });
  }
});

export default router;
