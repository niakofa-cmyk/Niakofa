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
 * Kept for Admin / GIS tooling; Spirals discovery no longer requires this.
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
 * Legacy Host Signal / GIS contract. Retained for Admin tooling.
 * Spiral discovery uses isCuratedDiscoveryNeighborhood instead.
 */
export function isActiveNeighborhood(
  row: NeighborhoodGeometry,
  now = new Date(),
): boolean {
  return isHostSignalEligibleNeighborhood(row) && getNeighborhoodGeometryStatus(row, now) === "verified";
}

/** Product catalog neighborhood_ids for Fort Worth (migration 0064). */
export const FORT_WORTH_CURATED_NEIGHBORHOOD_IDS = [
  "southside",
  "near_southside",
  "polytechnic",
  "riverside",
  "downtown",
  "east_fort_worth",
  "north_fort_worth",
  "stop_six",
  "wedgwood",
] as const;

/**
 * Curated Spiral discovery eligibility (location-independent).
 * City-wide Spirals are handled by callers (neighborhood_id == null).
 * Generated hints never appear.
 *
 * Accepts:
 * - source_kind curated | niakofa_curated
 * - authority_level curated
 * - null/empty source_kind (legacy seed rows from migration 0064 set `source` not source_kind)
 * - known Fort Worth catalog neighborhood_id when provided on the row
 */
export function isCuratedDiscoveryNeighborhood(row: {
  source_kind?: string | null;
  authority_level?: string | null;
  neighborhood_id?: string | null;
  /** string slug from city_neighborhoods.neighborhood_id column when joined */
  neighborhood_slug?: string | null;
}): boolean {
  if (row.source_kind === "generated_hint" || row.authority_level === "generated") return false;
  if (row.source_kind === "curated" || row.source_kind === "niakofa_curated") return true;
  if (row.authority_level === "curated") return true;
  // Legacy seed rows may omit source_kind; treat as curated catalog.
  if (row.source_kind == null || row.source_kind === "") return true;
  const slug = row.neighborhood_slug ?? (typeof row.neighborhood_id === "string" ? row.neighborhood_id : null);
  if (slug && (FORT_WORTH_CURATED_NEIGHBORHOOD_IDS as readonly string[]).includes(slug)) return true;
  return false;
}

function pointInPolygonRings(lng: number, lat: number, rings: PolygonRings): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

export function pointInPolygon(lng: number, lat: number, geojson: unknown): boolean | null {
  const polygons = extractPolygons(geojson);
  if (!polygons) return null;
  return polygons.some((rings) => pointInPolygonRings(lng, lat, rings));
}

function geometryIsEffective(row: NeighborhoodGeometry, now: Date): "active" | "inactive" | "invalid" {
  if (!row.geometry_verified) return "inactive";
  if (row.verified === false) return "inactive";
  if (row.source_kind === "generated_hint" || row.authority_level === "generated") return "inactive";
  if (!row.geometry_effective_at) return "active";

  const effectiveAt = new Date(row.geometry_effective_at);
  if (!Number.isFinite(effectiveAt.getTime())) return "invalid";
  return effectiveAt.getTime() <= now.getTime() ? "active" : "inactive";
}

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
