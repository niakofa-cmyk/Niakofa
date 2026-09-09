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
  geometry_source?: string | null;
  geometry_version?: string | null;
  geometry_verified?: boolean | null;
  geometry_effective_at?: Date | string | null;
  /** When present, Host Signal also requires verified === true */
  verified?: boolean | null;
  source_kind?: string | null;
  authority_level?: string | null;
};

export type NeighborhoodGeometryStatus =
  | "unconfigured"
  | "pending_review"
  | "scheduled"
  | "verified"
  | "invalid";

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

/**
 * Host Signal GPS-active contract for production city_neighborhoods rows.
 * Geometry verification alone is not enough; authority verified must also be true,
 * and generated hints are permanently excluded.
 */
export function isHostSignalEligibleNeighborhood(row: {
  verified?: boolean | null;
  geometry_verified?: boolean | null;
  source_kind?: string | null;
  authority_level?: string | null;
}): boolean {
  if (row.source_kind === "generated_hint" || row.authority_level === "generated") return false;
  return row.verified === true && row.geometry_verified === true;
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

/**
 * Validate geometry before it is persisted as an admin-reviewed boundary.
 * The evaluator intentionally remains tolerant of unverified drafts, but a
 * reviewed row must never contain a malformed polygon or partial radius.
 */
export function validateNeighborhoodGeometry(
  row: Pick<NeighborhoodGeometry, "center_lat" | "center_lng" | "radius_meters" | "polygon_geojson">,
): string | null {
  const hasPolygon = row.polygon_geojson != null;
  const hasAnyRadiusField =
    row.center_lat != null || row.center_lng != null || row.radius_meters != null;

  if (hasPolygon && pointInPolygon(0, 0, row.polygon_geojson) === null) {
    return "polygon_geojson must be a valid Polygon or MultiPolygon with numeric coordinates";
  }

  if (hasAnyRadiusField) {
    if (
      !isFiniteNumber(row.center_lat) ||
      !isFiniteNumber(row.center_lng) ||
      row.center_lat < -90 ||
      row.center_lat > 90 ||
      row.center_lng < -180 ||
      row.center_lng > 180
    ) {
      return "center_lat and center_lng must be valid latitude/longitude coordinates";
    }
    if (!isFiniteNumber(row.radius_meters) || row.radius_meters <= 0) {
      return "radius_meters must be greater than zero";
    }
  }

  if (!hasPolygon && !hasAnyRadiusField) {
    return "provide polygon_geojson or a complete center/radius geometry";
  }

  return null;
}

export function getNeighborhoodGeometryStatus(
  row: NeighborhoodGeometry,
  now = new Date(),
): NeighborhoodGeometryStatus {
  const hasGeometry =
    row.polygon_geojson != null ||
    row.center_lat != null ||
    row.center_lng != null ||
    row.radius_meters != null;

  if (!hasGeometry) return "unconfigured";
  if (!row.geometry_verified) return "pending_review";

  const geometryError = validateNeighborhoodGeometry(row);
  if (geometryError) return "invalid";

  if (row.geometry_effective_at) {
    const effectiveAt = new Date(row.geometry_effective_at);
    if (!Number.isFinite(effectiveAt.getTime())) return "invalid";
    if (effectiveAt.getTime() > now.getTime()) return "scheduled";
  }

  return "verified";
}

/**
 * A neighborhood Spiral is visible in discovery only when the production
 * authority contract is complete. This is intentionally stricter than merely
 * having a polygon: generated hints, unverified authority rows, malformed
 * geometry, and future-effective geometry must stay out of the public list.
 */
export function isActiveNeighborhood(
  row: NeighborhoodGeometry,
  now = new Date(),
): boolean {
  return isHostSignalEligibleNeighborhood(row) && getNeighborhoodGeometryStatus(row, now) === "verified";
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
  // When authority fields are present, Host Signal requires the full contract.
  if (row.verified === false) return "inactive";
  if (row.source_kind === "generated_hint" || row.authority_level === "generated") return "inactive";
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
