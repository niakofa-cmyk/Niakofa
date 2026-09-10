/**
 * Canonical public Spiral routes and client-side discovery policy.
 *
 * Spirals are curated community spaces. Discovery, joining, and hosting do not
 * require GPS, Map Locator, reverse geocoding, or neighborhood geometry.
 * Legacy Circle aliases remain supported for existing links.
 */
export const SPIRALS_PATHS = {
  discovery: "/audio-spirals",
  room: (sessionId: string | number) => `/audio-spiral/${sessionId}`,
} as const;

type SpiralWithNeighborhood = {
  id: number;
  neighborhood_id?: number | null;
  neighborhood_geometry_status?: string;
  source_kind?: string | null;
};

/**
 * Public catalog rows are curated rows plus the city-wide Spiral.
 * Geometry/GPS state is deliberately ignored.
 */
export function filterActiveNeighborhoodSpirals<T extends SpiralWithNeighborhood>(spirals: T[]): T[] {
  const curated = spirals.filter((spiral) =>
    spiral.neighborhood_id == null ||
    spiral.source_kind === "niakofa_curated" ||
    spiral.source_kind === "curated"
  );

  // A configured city exposes one city-wide Spiral and at most nine curated
  // neighborhood suggestions. Preserve the server's stable catalog order.
  const citywide = curated.filter((spiral) => spiral.neighborhood_id == null).slice(0, 1);
  const neighborhoods = curated.filter((spiral) => spiral.neighborhood_id != null).slice(0, 9);
  return [...citywide, ...neighborhoods];
}

/**
 * GPS is not part of Spiral discovery. Keep this compatibility helper as a
 * stable identity operation for callers that still pass an old local id.
 */
export function orderSpiralsForLocation<T extends SpiralWithNeighborhood>(spirals: T[]): T[] {
  return [...spirals];
}

/** Backwards-compatible helper retained for existing callers. */
export function promoteLocalSpiral<T extends SpiralWithNeighborhood>(
  spirals: T[] | undefined,
  _localSpiralId?: number | null,
): T[] | undefined {
  return spirals ? [...spirals] : spirals;
}

export const CIRCLE_ROUTE_ALIASES = {
  discovery: "/audio-circles",
  room: "/audio-circle/:id",
} as const;

export const SPIRAL_ROUTE_ALIASES = {
  discovery: [SPIRALS_PATHS.discovery, CIRCLE_ROUTE_ALIASES.discovery],
  room: ["/audio-spiral/:id", CIRCLE_ROUTE_ALIASES.room],
} as const;

export function isSpiralRoute(pathname: string): boolean {
  return (
    pathname === SPIRALS_PATHS.discovery ||
    pathname === CIRCLE_ROUTE_ALIASES.discovery ||
    pathname.startsWith("/audio-spiral/") ||
    pathname.startsWith("/audio-circle/")
  );
}
