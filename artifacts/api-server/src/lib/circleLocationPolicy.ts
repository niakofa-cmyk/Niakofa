/**
 * Server-authoritative location policy for hosting a Circle.
 *
 * Hosting requires a fresh, accurate GPS fix whose reverse-geocoded city
 * matches the Circle. Joining is deliberately location-independent.
 * Raw coordinates are never persisted or written to the audit log.
 */
import { z } from "zod";
import { logger } from "./logger";

const DEFAULT_MAX_ACCURACY_METERS = 150;
const DEFAULT_MAX_AGE_MS = 120_000;
const CLOCK_SKEW_MS = 30_000;

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
}

export function normalizeCityKey(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

export async function reverseGeocodeCircleStart(
  location: CircleStartLocation,
): Promise<ReverseGeocodedLocation> {
  const token = process.env["MAPBOX_TOKEN"];
  if (!token) throw new Error("MAPBOX_TOKEN is required for Circle start verification");

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(`${location.longitude},${location.latitude}`)}.json` +
    `?types=place,locality&limit=5&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`Reverse geocoding failed with HTTP ${response.status}`);

  const data = (await response.json()) as {
    features?: Array<{
      text?: string;
      place_type?: string[];
      context?: Array<{ id?: string; text?: string; short_code?: string }>;
    }>;
  };
  const features = data.features ?? [];
  if (!features.length) throw new Error("GPS coordinate could not be mapped to a city");

  const feature =
    features.find((item) => item.place_type?.includes("place")) ??
    features.find((item) => item.place_type?.includes("locality")) ??
    features[0];
  const city =
    feature.text?.trim() ??
    feature.context?.find((item) => item.id?.startsWith("place."))?.text?.trim() ??
    feature.context?.find((item) => item.id?.startsWith("locality."))?.text?.trim();
  if (!city) throw new Error("GPS coordinate has no resolvable city");

  const region = feature.context?.find((item) => item.id?.startsWith("region."));
  const shortCode = region?.short_code?.toUpperCase();
  const stateCode = shortCode
    ? shortCode.match(/^US-([A-Z]{2})$/)?.[1] ?? shortCode
    : null;

  return {
    cityKey: normalizeCityKey(city),
    cityDisplay: city,
    countyDisplay: feature.context?.find((item) => item.id?.startsWith("district."))?.text?.trim() ?? null,
    stateCode,
  };
}

export type CircleStartLocationResult =
  | {
      ok: true;
      cityKey: string;
      cityDisplay: string;
      countyDisplay: string | null;
      stateCode: string | null;
      accuracyBucket: string;
    }
  | { ok: false; reason: string; code: string };

export async function verifyCircleStartLocation(
  circleCityKey: string,
  location: CircleStartLocation,
  opts?: { nowMs?: number; userId?: number; circleId?: number },
): Promise<CircleStartLocationResult> {
  const freshness = validateFreshAccurateLocation(location, opts?.nowMs);
  if (!freshness.ok) {
    logLocationDecision({
      decision: "denied",
      code: freshness.code,
      circleCityKey,
      userId: opts?.userId,
      circleId: opts?.circleId,
      accuracyBucket: accuracyBucket(location.accuracy_meters),
    });
    return freshness;
  }

  const expectedKey = normalizeCityKey(circleCityKey);
  try {
    const resolved = await reverseGeocodeCircleStart(location);
    if (resolved.cityKey !== expectedKey) {
      const result = {
        ok: false as const,
        code: "CIRCLE_START_WRONG_CITY",
        reason: `You can only start this Circle from inside ${circleCityKey.replace(/_/g, " ")}. You may still join Circles from other locations.`,
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
      accuracyBucket: accuracyBucket(location.accuracy_meters),
    };
  } catch (err) {
    logger.warn({ err, circleCityKey: expectedKey }, "circles: reverse geocode failed — fail closed");
    const result = {
      ok: false as const,
      code: "CIRCLE_START_LOCATION_UNVERIFIED",
      reason: "Niakofa could not verify your current location. Refresh GPS and try again.",
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
    `circles: start location ${payload.decision} (${payload.code})`,
  );
}