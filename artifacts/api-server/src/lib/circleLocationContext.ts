import { evaluateNeighborhoodGeofence } from "./neighborhoodGeofence";

export type LocalSpiralCandidate = {
  id: number;
  neighborhood_id: number | null;
  neighborhood_name: string | null;
};

function normalizeNeighborhoodKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Match Mapbox's neighborhood hint to a persisted Spiral. A city-wide Spiral
 * is the safe fallback when the provider has verified the city but did not
 * return a neighborhood that exists in our curated list.
 */
export function pickLocalSpiral<T extends LocalSpiralCandidate>(
  circles: T[],
  neighborhoodHint: string | null | undefined,
): T | null {
  const hint = normalizeNeighborhoodKey(neighborhoodHint ?? "");
  const matchedNeighborhood = hint
    ? circles.find((circle) => {
        const name = normalizeNeighborhoodKey(circle.neighborhood_name ?? "");
        return name.length > 0 && (name === hint || name.includes(hint) || hint.includes(name));
      })
    : undefined;
  return matchedNeighborhood ?? circles.find((circle) => circle.neighborhood_id == null) ?? null;
}

type GeometryAwareSpiralCandidate = LocalSpiralCandidate & {
  center_lat?: number | null;
  center_lng?: number | null;
  radius_meters?: number | null;
  polygon_geojson?: unknown;
  geometry_verified?: boolean | null;
  geometry_effective_at?: Date | string | null;
};

export function pickVerifiedLocalSpiral<T extends GeometryAwareSpiralCandidate>(
  circles: T[],
  latitude: number,
  longitude: number,
  neighborhoodHint: string | null | undefined,
  now = new Date(),
): {
  circle: T | null;
  neighborhoodGeofenceStatus: "inside" | "outside" | "no_geometry" | "invalid_geometry";
} {
  const neighborhoodCircles = circles.filter((circle) => circle.neighborhood_id != null);
  const hintedCircle = pickLocalSpiral(neighborhoodCircles, neighborhoodHint);
  const evaluated = neighborhoodCircles.map((circle) => ({
    circle,
    result: evaluateNeighborhoodGeofence(latitude, longitude, circle, now),
  }));
  const inside = evaluated.filter(({ result }) => result.status === "inside").map(({ circle }) => circle);
  const circle = pickLocalSpiral(inside, neighborhoodHint);
  const hintedResult = hintedCircle
    ? evaluated.find(({ circle: candidate }) => candidate.id === hintedCircle.id)?.result
    : undefined;

  return {
    circle,
    neighborhoodGeofenceStatus: circle
      ? "inside"
      : hintedResult?.status === "outside" || hintedResult?.status === "invalid_geometry"
        ? hintedResult.status
        : "no_geometry",
  };
}