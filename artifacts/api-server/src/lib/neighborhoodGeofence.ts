/**
 * Neighborhood geofencing for Spiral host eligibility.
 *
 * Pure JS evaluation so tests and non-PostGIS environments work.
 * Prefer polygon when present; otherwise center + radius.
 * Unverified or missing geometry → no neighborhood gate (city gate still applies).
 */
import { distanceMeters } from "./geo";

export type NeighborhoodGeometry = {
  center_lat?: number | null;
  center_lng?: number | null;
  radius_meters?: number | null;
  polygon_geojson?: unknown;
  geometry_verified?: boolean | null;
  geometry_effective_at?: Date | string | null;
};

export type GeofenceResult =
  | { status: "inside"; method: "polygon" | "radius" }
  | { status: "outside"; method: "polygon" | "radius" }
  | { status: "no_geometry" }
  | { status: "invalid_geometry"; reason: string };

type LngLat = [number, number];

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Ray-casting point-in-polygon. Ring is [lng, lat][]. */
export function pointInRing(lng: number, lat: number, ring: LngLat[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function extractRings(geojson: unknown): LngLat[][] {
  if (!geojson || typeof geojson !== "object") return [];
  const g = geojson as { type?: string; coordinates?: unknown };
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[])
      .filter((ring): ring is LngLat[] => Array.isArray(ring))
      .map((ring) =>
        ring.filter(
          (pt): pt is LngLat =>
            Array.isArray(pt) && isFiniteNumber(pt[0]) && isFiniteNumber(pt[1]),
        ),
      );
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    const rings: LngLat[][] = [];
    for (const poly of g.coordinates as unknown[]) {
      if (!Array.isArray(poly)) continue;
      for (const ring of poly) {
        if (!Array.isArray(ring)) continue;
        rings.push(
          ring.filter(
            (pt): pt is LngLat =>
              Array.isArray(pt) && isFiniteNumber(pt[0]) && isFiniteNumber(pt[1]),
          ),
        );
      }
    }
    return rings;
  }
  return [];
}

export function pointInPolygon(lng: number, lat: number, geojson: unknown): boolean | null {
  const rings = extractRings(geojson);
  if (!rings.length) return null;
  // Exterior rings only for simple containment (first ring of each polygon).
  // Holes are ignored for v1 host gating (fail closed on exterior only).
  let anyExterior = false;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    anyExterior = true;
    if (pointInRing(lng, lat, ring)) return true;
  }
  return anyExterior ? false : null;
}

function geometryIsEffective(row: NeighborhoodGeometry, now = new Date()): boolean {
  if (!row.geometry_verified) return false;
  if (row.geometry_effective_at) {
    const at = new Date(row.geometry_effective_at);
    if (Number.isFinite(at.getTime()) && at.getTime() > now.getTime()) return false;
  }
  return true;
}

/**
 * Evaluate whether (lat, lng) is inside the neighborhood's verified geometry.
 * Returns no_geometry when data is missing or not yet verified — callers must
 * NOT treat that as a hard deny for hosting (city gate still applies).
 */
export function evaluateNeighborhoodGeofence(
  lat: number,
  lng: number,
  row: NeighborhoodGeometry | null | undefined,
  now = new Date(),
): GeofenceResult {
  if (!row || !geometryIsEffective(row, now)) {
    return { status: "no_geometry" };
  }

  const poly = pointInPolygon(lng, lat, row.polygon_geojson);
  if (poly === true) return { status: "inside", method: "polygon" };
  if (poly === false) return { status: "outside", method: "polygon" };

  if (
    isFiniteNumber(row.center_lat) &&
    isFiniteNumber(row.center_lng) &&
    isFiniteNumber(row.radius_meters) &&
    row.radius_meters > 0
  ) {
    const d = distanceMeters(lat, lng, row.center_lat, row.center_lng);
    if (d <= row.radius_meters) return { status: "inside", method: "radius" };
    return { status: "outside", method: "radius" };
  }

  return {
    status: "invalid_geometry",
    reason: "geometry_verified is true but no usable polygon or radius was provided",
  };
}
