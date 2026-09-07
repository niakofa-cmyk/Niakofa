/**
 * Neighborhood geofencing for Spiral host eligibility.
 *
 * Geometry is optional until it is reviewed and marked effective. The city
 * host fence remains authoritative when geometry is absent or unverified.
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
type PolygonRings = LngLat[][];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Ray-casting point-in-ring. Ring coordinates are [longitude, latitude]. */
export function pointInRing(lng: number, lat: number, ring: LngLat[]): boolean {
  if (ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function parseRing(value: unknown): LngLat[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < 3) return null;

  // Do not filter malformed vertices out of a reviewed boundary. Doing so
  // changes the geometry while still presenting it as verified, which can
  // incorrectly grant or deny host eligibility. A verified ring must be
  // wholly valid or fail closed.
  const points: LngLat[] = [];
  for (const point of value) {
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      !isFiniteNumber(point[0]) ||
      !isFiniteNumber(point[1]) ||
      point[0] < -180 ||
      point[0] > 180 ||
      point[1] < -90 ||
      point[1] > 90
    ) {
      return null;
    }
    points.push([point[0], point[1]]);
  }

  return points;
}

function extractPolygons(geojson: unknown): PolygonRings[] | null {
  if (!geojson || typeof geojson !== "object") return null;
  const value = geojson as { type?: unknown; coordinates?: unknown };

  if (value.type === "Polygon" && Array.isArray(value.coordinates)) {
    const rings = value.coordinates.map(parseRing);
    return rings.length > 0 && rings.every((ring): ring is LngLat[] => ring !== null) ? [rings] : null;
  }

  if (value.type === "MultiPolygon" && Array.isArray(value.coordinates)) {
    const polygons: PolygonRings[] = [];
    for (const polygon of value.coordinates) {
      if (!Array.isArray(polygon)) return null;
      const rings = polygon.map(parseRing);
      if (!rings.every((ring): ring is LngLat[] => ring !== null)) return null;
      polygons.push(rings);
    }
    return polygons.length > 0 && polygons.every((rings) => rings.length > 0) ? polygons : null;
  }

  return null;
}

function pointInPolygonRings(lng: number, lat: number, rings: PolygonRings): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

/**
 * Returns null for absent or malformed geometry. A malformed verified row is
 * handled as invalid by evaluateNeighborhoodGeofence rather than guessed.
 */
export function pointInPolygon(lng: number, lat: number, geojson: unknown): boolean | null {
  const polygons = extractPolygons(geojson);
  if (!polygons) return null;
  return polygons.some((rings) => pointInPolygonRings(lng, lat, rings));
}

function geometryIsEffective(row: NeighborhoodGeometry, now: Date): "active" | "inactive" | "invalid" {
  if (!row.geometry_verified) return "inactive";
  if (!row.geometry_effective_at) return "active";

  const effectiveAt = new Date(row.geometry_effective_at);
  if (!Number.isFinite(effectiveAt.getTime())) return "invalid";
  return effectiveAt.getTime() <= now.getTime() ? "active" : "inactive";
}

/**
 * Evaluate whether (lat, lng) is inside reviewed neighborhood geometry.
 * Missing/unverified/future geometry returns no_geometry so city-only hosting
 * remains available. Verified but malformed geometry fails closed.
 */
export function evaluateNeighborhoodGeofence(
  lat: number,
  lng: number,
  row: NeighborhoodGeometry | null | undefined,
  now = new Date(),
): GeofenceResult {
  if (!row) return { status: "no_geometry" };

  const effective = geometryIsEffective(row, now);
  if (effective === "inactive") return { status: "no_geometry" };
  if (effective === "invalid") {
    return { status: "invalid_geometry", reason: "geometry_effective_at is invalid" };
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { status: "invalid_geometry", reason: "GPS coordinates are not finite" };
  }

  if (row.polygon_geojson != null) {
    const polygonResult = pointInPolygon(lng, lat, row.polygon_geojson);
    if (polygonResult === true) return { status: "inside", method: "polygon" };
    if (polygonResult === false) return { status: "outside", method: "polygon" };
    return {
      status: "invalid_geometry",
      reason: "polygon_geojson is not a valid Polygon or MultiPolygon",
    };
  }

  if (
    isFiniteNumber(row.center_lat) &&
    isFiniteNumber(row.center_lng) &&
    isFiniteNumber(row.radius_meters) &&
    row.radius_meters > 0
  ) {
    const distance = distanceMeters(lat, lng, row.center_lat, row.center_lng);
    return distance <= row.radius_meters
      ? { status: "inside", method: "radius" }
      : { status: "outside", method: "radius" };
  }

  return {
    status: "invalid_geometry",
    reason: "geometry_verified is true but no usable polygon or radius was provided",
  };
}