/**
 * geo-utils.ts
 *
 * Shared geographic computation utilities — distance, proximity thresholds.
 *
 * All functions are pure, deterministic, and side-effect-free so they can be
 * unit-tested without a DOM, React, or browser environment.
 *
 * Why a shared file instead of inline implementations?
 *   map.tsx and request-active.tsx previously each had their own copy of the
 *   haversine formula (one in miles, one in meters). A bug fix or precision
 *   change in one copy would not propagate to the other. This file is the
 *   single source of truth.
 */

// ── Earth radius constants ────────────────────────────────────────────────────

/** Earth mean radius in meters (WGS-84 semi-major ≈ 6 378 137 m, mean ≈ 6 371 000 m). */
const EARTH_RADIUS_METERS = 6_371_000;

/** Meters per statute mile (exact by definition since 1959). */
const METERS_PER_MILE = 1_609.344;

// ── Proximity threshold ───────────────────────────────────────────────────────

/**
 * Distance below which a helper is considered "nearby" for the SankofaBird
 * wing-salute micro-reaction.  Used in both map.tsx and request-active.tsx.
 *
 * Doc: "When another Niakofa user is nearby, your bird looks over →
 *       small wing salute → returns to hovering."
 * Chosen at 200 m: close enough that the two users are about to meet, far
 * enough to give the salute 5–15 s of lead time before actual contact.
 */
export const NEARBY_USER_METERS = 200;

// ── Haversine formula ─────────────────────────────────────────────────────────

/**
 * Great-circle distance between two WGS-84 coordinates, in **meters**.
 *
 * Uses the haversine formula which is accurate to within ~0.5 % at distances
 * relevant to on-ground navigation (< 100 km).  Handles the 0°/360° wrap and
 * is safe at the poles.
 *
 * @param lat1 Latitude of point A  (degrees, −90 … +90)
 * @param lng1 Longitude of point A (degrees, −180 … +180)
 * @param lat2 Latitude of point B  (degrees, −90 … +90)
 * @param lng2 Longitude of point B (degrees, −180 … +180)
 * @returns Distance in metres (≥ 0)
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Great-circle distance between two WGS-84 coordinates, in **statute miles**.
 *
 * Thin wrapper over `haversineMeters` — kept for backwards compatibility with
 * the service-area radius checks in map.tsx which work in miles.
 */
export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineMeters(lat1, lng1, lat2, lng2) / METERS_PER_MILE;
}

/**
 * Returns `true` if two coordinates are within `NEARBY_USER_METERS` of each
 * other — the threshold used for the SankofaBird wing-salute micro-reaction.
 *
 * Both pages (map.tsx, request-active.tsx) must use this function so the
 * threshold is changed in exactly one place.
 *
 * @param lat1 Your latitude
 * @param lng1 Your longitude
 * @param lat2 Other user / destination latitude
 * @param lng2 Other user / destination longitude
 */
export function isNearbyUser(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): boolean {
  return haversineMeters(lat1, lng1, lat2, lng2) < NEARBY_USER_METERS;
}
