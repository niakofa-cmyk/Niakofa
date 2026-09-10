/**
 * Spiral hosting policy.
 *
 * Spirals are curated community spaces. Hosting is intentionally independent
 * of GPS, Map Locator, reverse geocoding, and neighborhood geometry. The
 * Circle-era exports remain for compatibility with legacy routes/tests.
 */
import { z } from "zod";

export const CircleStartLocationBody = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
  accuracy_meters: z.number().finite().positive().lte(10_000),
  captured_at: z.string().datetime({ offset: true }),
}).optional();

export type CircleStartLocation = z.infer<typeof CircleStartLocationBody>;

export interface ReverseGeocodedLocation {
  cityKey: string;
  cityDisplay: string;
  countyDisplay: string | null;
  stateCode: string | null;
  neighborhoodHint: string | null;
}

export function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function displayCityName(cityKeyOrName: string): string {
  return cityKeyOrName.replace(/_/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Retained for compatibility; city matching is no longer a hosting gate. */
export function citiesMatchForHost(spiralCityKey: string, resolvedCityKey: string): boolean {
  return normalizeCityKey(spiralCityKey) === normalizeCityKey(resolvedCityKey);
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
  _location: CircleStartLocation,
  _nowMs = Date.now(),
): { ok: true } {
  // Legacy validation remains callable but is no longer part of Spiral
  // hosting. Do not make a GPS permission or freshness decision here.
  return { ok: true };
}

/**
 * Legacy reverse-geocoder export. It is deliberately not used by Spiral
 * hosting. Callers that still need it receive an explicit deprecation error
 * rather than silently performing a location lookup.
 */
export async function reverseGeocodeCircleStart(
  _location: NonNullable<CircleStartLocation>,
): Promise<ReverseGeocodedLocation> {
  throw new Error("Spiral reverse geocoding is disabled; hosting is location-independent");
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

export function buildHostSignal(opts: {
  canHost: boolean;
  spiralCityDisplay: string;
  spiralNeighborhood?: string | null;
  resolvedCityDisplay?: string | null;
  neighborhoodHint?: string | null;
  neighborhoodGeofenceStatus?: "inside" | "outside" | "no_geometry" | "invalid_geometry" | null;
  code?: string;
  reason?: string;
}): {
  status: "ready" | "blocked";
  message: string;
  verifiedNeighborhoodHint?: string | null;
  neighborhoodGeofenceStatus?: string | null;
} {
  if (opts.canHost) {
    return {
      status: "ready",
      message: `You can host${opts.spiralNeighborhood ? ` the ${opts.spiralNeighborhood}` : ""} Spiral in ${opts.spiralCityDisplay}.`,
      verifiedNeighborhoodHint: null,
      neighborhoodGeofenceStatus: null,
    };
  }
  return {
    status: "blocked",
    message: opts.reason ?? "This Spiral is not currently available for hosting.",
    verifiedNeighborhoodHint: null,
    neighborhoodGeofenceStatus: null,
  };
}

/**
 * Compatibility entry point. A selected curated Spiral is always hostable;
 * the optional legacy location payload is ignored.
 */
export async function verifyCircleStartLocation(
  circleCityKey: string,
  _location?: CircleStartLocation,
  _opts?: { nowMs?: number; userId?: number; circleId?: number },
): Promise<CircleStartLocationResult> {
  const spiralCityKey = normalizeCityKey(circleCityKey);
  return {
    ok: true,
    cityKey: spiralCityKey,
    cityDisplay: displayCityName(circleCityKey),
    countyDisplay: null,
    stateCode: null,
    neighborhoodHint: null,
    accuracyBucket: "not_applicable",
    spiralCityDisplay: displayCityName(circleCityKey),
    canHost: true,
  };
}
