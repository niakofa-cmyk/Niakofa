/**
 * Server-authoritative location policy for hosting a Spiral.
 *
 * Hosting requires a fresh, accurate GPS fix whose reverse-geocoded city
 * matches the Spiral. Joining is deliberately location-independent.
 * Raw coordinates are never persisted or written to the audit log.
 *
 * The public product is now Spirals, but the Circle-era module name is kept
 * internally for backward-compatible lifecycle handlers and existing sessions.
 */
import { z } from "zod";
import { logger } from "./logger";

const DEFAULT_MAX_ACCURACY_METERS = 150;
const DEFAULT_MAX_AGE_MS = 120_000;
const CLOCK_SKEW_MS = 30_000;

/**
 * Reverse geocoding can name a Fort Worth enclave as its own municipality.
 * Keep this table deliberately small: it handles known administrative
 * enclaves without turning county-wide geography into a hosting boundary.
 */
const CITY_ALIASES: Record<string, readonly string[]> = {
  fort_worth: ["fort_worth", "ft_worth", "ftworth", "westworth_village", "river_oaks", "westover_hills"],
};

export const CircleStartLocationBody = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
  accuracy_meters: z.number().finite().positive().lte(10_000),
  captured_at: z.string().datetime({ offset: true }),
});

export type CircleStartLocation = z.infer<typeof CircleStartLocationBody>;

export interface ReverseGeocodedLocation {
  cityKey: string;
  cityDisplay: string;
  countyDisplay: string | null;
  stateCode: string | null;
  neighborhoodHint: string | null;
}

export function normalizeCityKey(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function displayCityName(cityKeyOrName: string): string {
  const raw = cityKeyOrName.replace(/_/g, " ").trim();
  return raw.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function citiesMatchForHost(spiralCityKey: string, resolvedCityKey: string): boolean {
  const expected = normalizeCityKey(spiralCityKey);
  const got = normalizeCityKey(resolvedCityKey);
  if (expected === got) return true;
  return CITY_ALIASES[expected]?.includes(got) ?? false;
}

function maxAccuracyMeters(): number {
  const value = Number(process.env["CIRCLES_START_MAX_LOCATION_ACCURACY_METERS"]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_ACCURACY_METERS;
}

function maxAgeMs(): number {
  const value = Number(process.env["CIRCLES_START_LOCATION_MAX_AGE_MS"]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_AGE_MS;
}

export function accuracyBucket(meters: number): string {
  if (meters <= 25) return "<=25m";
  if (meters <= 50) return "<=50m";
  if (meters <= 100) return "<=100m";
  if (meters <= 150) return "<=150m";
  if (meters <= 500) return "<=500m";
  return ">500m";
}

export function validateFreshAccurateLocation(
  location: CircleStartLocation,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string; code: string } {
  if (location.accuracy_meters > maxAccuracyMeters()) {
    return {
      ok: false,
      code: "GPS_ACCURACY_TOO_LOW",
      reason: `GPS accuracy must be ${maxAccuracyMeters()} meters or better (got ~${Math.round(location.accuracy_meters)}m). Move outdoors or wait for a better fix.`,
    };
  }

  const capturedAtMs = Date.parse(location.captured_at);
  if (!Number.isFinite(capturedAtMs)) {
    return { ok: false, code: "GPS_TIMESTAMP_INVALID", reason: "Invalid GPS timestamp." };
  }
  if (capturedAtMs > nowMs + CLOCK_SKEW_MS) {
    return { ok: false, code: "GPS_TIMESTAMP_FUTURE", reason: "GPS timestamp is in the future." };
  }
  if (nowMs - capturedAtMs > maxAgeMs()) {
    return {
      ok: false,
      code: "GPS_STALE",
      reason: "GPS fix is too old. Refresh your location and try again.",
    };
  }
  return { ok: true };
}

/**
 * Mapbox Geocoding v6 reverse endpoint.
 *
 * Do not send v5-style `limit=5` with multiple reverse `types`: v6 requires a
 * single type when limit is present. We intentionally omit both so Mapbox can
 * return the full administrative hierarchy.
 */

type ContextItem = {
  id?: string;
  text?: string;
  name?: string;
  short_code?: string;
};

type ReverseGeocodeFeature = {
  text?: string;
  place_type?: string[];
  feature_type?: string;
  properties?: { name?: string; feature_type?: string };
  context?:
    | ContextItem[]
    | {
        place?: { name?: string };
        locality?: { name?: string };
        neighborhood?: { name?: string };
        district?: { name?: string };
        region?: { name?: string; short_code?: string };
      };
};

/** A string that looks like a street address / house-numbered label, never a city. */
function looksLikeAddressString(text: string): boolean {
  const candidate = text.trim();
  if (!candidate) return true;
  if (/^\d+[\s,]/.test(candidate)) return true;
  return /\b(street|st\.?|avenue|ave\.?|drive|dr\.?|road|rd\.?|lane|ln\.?|boulevard|blvd\.?|way|court|ct\.?|circle|cir\.?)\b$/i.test(
    candidate,
  );
}

function featureTypes(feature: ReverseGeocodeFeature): string[] {
  return [
    feature.feature_type,
    feature.properties?.feature_type,
    ...(feature.place_type ?? []),
  ].filter((value): value is string => Boolean(value));
}

function isAddressLikeFeature(feature: ReverseGeocodeFeature): boolean {
  const types = featureTypes(feature);
  return (
    types.some((type) => type === "address" || type === "street" || type === "secondary_address") ||
    looksLikeAddressString(feature.text ?? feature.properties?.name ?? "")
  );
}

function isCityFeature(feature: ReverseGeocodeFeature): boolean {
  const types = featureTypes(feature);
  return types.includes("place") || types.includes("locality");
}

type ReverseGeocodeAccumulator = {
  city?: string;
  countyDisplay: string | null;
  stateCode: string | null;
  neighborhoodHint: string | null;
};

function applyContext(context: ReverseGeocodeFeature["context"], acc: ReverseGeocodeAccumulator): void {
  if (!context) return;

  if (Array.isArray(context)) {
    if (!acc.city) {
      const place = context.find((item) => item.id?.startsWith("place."));
      const locality = context.find((item) => item.id?.startsWith("locality."));
      const candidate = place?.text?.trim() ?? place?.name?.trim() ?? locality?.text?.trim() ?? locality?.name?.trim();
      if (candidate && !looksLikeAddressString(candidate)) acc.city = candidate;
    }

    const district = context.find((item) => item.id?.startsWith("district."));
    acc.countyDisplay = acc.countyDisplay ?? district?.text?.trim() ?? district?.name?.trim() ?? null;

    const region = context.find((item) => item.id?.startsWith("region."));
    const shortCode = region?.short_code?.toUpperCase();
    acc.stateCode =
      acc.stateCode ?? (shortCode ? shortCode.match(/^US-([A-Z]{2})$/)?.[1] ?? shortCode : null);

    const neighborhood = context.find((item) => item.id?.startsWith("neighborhood."));
    acc.neighborhoodHint =
      acc.neighborhoodHint ?? neighborhood?.text?.trim() ?? neighborhood?.name?.trim() ?? null;
    return;
  }

  if (!acc.city) {
    const candidate = context.place?.name?.trim() ?? context.locality?.name?.trim();
    if (candidate && !looksLikeAddressString(candidate)) acc.city = candidate;
  }
  acc.countyDisplay = acc.countyDisplay ?? context.district?.name?.trim() ?? null;
  const shortCode = context.region?.short_code?.toUpperCase();
  acc.stateCode =
    acc.stateCode ?? (shortCode ? shortCode.match(/^US-([A-Z]{2})$/)?.[1] ?? shortCode : null);
  acc.neighborhoodHint = acc.neighborhoodHint ?? context.neighborhood?.name?.trim() ?? null;
}

export async function reverseGeocodeCircleStart(
  location: CircleStartLocation,
): Promise<ReverseGeocodedLocation> {
  const token = process.env["MAPBOX_TOKEN"];
  if (!token) throw new Error("MAPBOX_TOKEN is required for Spiral start verification");

  const params = new URLSearchParams({
    longitude: String(location.longitude),
    latitude: String(location.latitude),
    access_token: token,
  });
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) detail += `: ${body.message}`;
    } catch {
      // Preserve the stable fail-closed error contract if Mapbox returns non-JSON.
    }
    throw new Error(`Reverse geocoding failed (${detail})`);
  }

  const data = (await response.json()) as { features?: ReverseGeocodeFeature[] };

  const features = data.features ?? [];
  if (!features.length) throw new Error("GPS coordinate could not be mapped to a city");

  const acc: ReverseGeocodeAccumulator = {
    countyDisplay: null,
    stateCode: null,
    neighborhoodHint: null,
  };

  // Prefer a real place/locality feature. Never use features[0] as a fallback:
  // Mapbox can rank a rooftop address before the administrative hierarchy.
  const cityFeature = features.find((feature) => isCityFeature(feature) && !isAddressLikeFeature(feature));
  if (cityFeature) {
    const direct = cityFeature.text?.trim() ?? cityFeature.properties?.name?.trim();
    if (direct && !looksLikeAddressString(direct)) acc.city = direct;
    applyContext(cityFeature.context, acc);
  }

  // Address and neighborhood features still carry useful administrative
  // context when Mapbox does not return a separate place/locality feature.
  if (!acc.city) {
    for (const feature of features) {
      applyContext(feature.context, acc);
      if (acc.city) break;
    }
  }

  if (!acc.neighborhoodHint) {
    const neighborhoodFeature = features.find(
      (item) => item.feature_type === "neighborhood" || item.place_type?.includes("neighborhood"),
    );
    acc.neighborhoodHint =
      neighborhoodFeature?.text?.trim() ?? neighborhoodFeature?.properties?.name?.trim() ?? null;
  }

  if (!acc.city) {
    // Fail closed with a distinguishable error rather than ever exposing an
    // address as a city or silently widening the host boundary.
    throw new Error("GPS coordinate has no resolvable city (place/locality)");
  }

  return {
    cityKey: normalizeCityKey(acc.city),
    cityDisplay: acc.city,
    countyDisplay: acc.countyDisplay,
    stateCode: acc.stateCode,
    neighborhoodHint: acc.neighborhoodHint,
  };
}

export type CircleStartLocationResult =
  | {
      ok: true;
      cityKey: string;
      cityDisplay: string;
      countyDisplay: string | null;
      stateCode: string | null;
      neighborhoodHint: string | null;
       accuracyBucket: string;
       spiralCityDisplay: string;
      canHost: true;
    }
  | {
      ok: false;
      reason: string;
      code: string;
      spiralCityKey: string;
      spiralCityDisplay: string;
      resolvedCityKey?: string;
      resolvedCityDisplay?: string;
      neighborhoodHint?: string | null;
      canHost: false;
    };

export async function verifyCircleStartLocation(
  circleCityKey: string,
  location: CircleStartLocation,
  opts?: { nowMs?: number; userId?: number; circleId?: number },
): Promise<CircleStartLocationResult> {
  const expectedKey = normalizeCityKey(circleCityKey);
  const expectedDisplay = displayCityName(circleCityKey);
  const freshness = validateFreshAccurateLocation(location, opts?.nowMs);
  if (!freshness.ok) {
    logLocationDecision({
      decision: "denied",
      code: freshness.code,
      circleCityKey: expectedKey,
      userId: opts?.userId,
      circleId: opts?.circleId,
      accuracyBucket: accuracyBucket(location.accuracy_meters),
    });
    return {
      ...freshness,
      spiralCityKey: expectedKey,
      spiralCityDisplay: expectedDisplay,
      canHost: false,
    };
  }

  try {
    const resolved = await reverseGeocodeCircleStart(location);
    if (!citiesMatchForHost(expectedKey, resolved.cityKey)) {
      const result = {
        ok: false as const,
        code: "CIRCLE_START_WRONG_CITY",
        reason: `You can only start this Spiral from inside ${expectedDisplay}. Your GPS currently places you in ${resolved.cityDisplay}. You may still join Spirals from other locations.`,
        spiralCityKey: expectedKey,
        spiralCityDisplay: expectedDisplay,
        resolvedCityKey: resolved.cityKey,
        resolvedCityDisplay: resolved.cityDisplay,
        neighborhoodHint: resolved.neighborhoodHint,
        canHost: false as const,
      };
      logLocationDecision({
        decision: "denied",
        code: result.code,
        circleCityKey: expectedKey,
        resolvedCityKey: resolved.cityKey,
        userId: opts?.userId,
        circleId: opts?.circleId,
        accuracyBucket: accuracyBucket(location.accuracy_meters),
      });
      return result;
    }

    logLocationDecision({
      decision: "allowed",
      code: "CIRCLE_START_LOCATION_OK",
      circleCityKey: expectedKey,
      resolvedCityKey: resolved.cityKey,
      userId: opts?.userId,
      circleId: opts?.circleId,
      accuracyBucket: accuracyBucket(location.accuracy_meters),
    });
    return {
      ok: true,
      cityKey: resolved.cityKey,
      cityDisplay: resolved.cityDisplay,
      countyDisplay: resolved.countyDisplay,
      stateCode: resolved.stateCode,
      neighborhoodHint: resolved.neighborhoodHint,
       accuracyBucket: accuracyBucket(location.accuracy_meters),
       spiralCityDisplay: expectedDisplay,
      canHost: true,
    };
  } catch (err) {
    logger.warn({ err, circleCityKey: expectedKey }, "spirals: reverse geocode failed — fail closed");
    const result = {
      ok: false as const,
      code: "CIRCLE_START_LOCATION_UNVERIFIED",
      reason: "Niakofa could not verify your current location. Refresh GPS and try again.",
      spiralCityKey: expectedKey,
      spiralCityDisplay: expectedDisplay,
      canHost: false as const,
    };
    logLocationDecision({
      decision: "denied",
      code: result.code,
      circleCityKey: expectedKey,
      userId: opts?.userId,
      circleId: opts?.circleId,
      accuracyBucket: accuracyBucket(location.accuracy_meters),
    });
    return result;
  }
}

function logLocationDecision(payload: {
  decision: "allowed" | "denied";
  code: string;
  circleCityKey: string;
  resolvedCityKey?: string;
  userId?: number;
  circleId?: number;
  accuracyBucket: string;
}) {
  logger.info(
    { event: "circle_start_location_check", ...payload, verified_at: new Date().toISOString() },
    `spirals: start location ${payload.decision} (${payload.code})`,
  );
}