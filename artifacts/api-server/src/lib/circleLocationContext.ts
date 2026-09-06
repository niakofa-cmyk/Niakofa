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