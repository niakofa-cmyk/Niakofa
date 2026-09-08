/**
 * Public Spirals routes. The legacy Circle routes remain supported for existing
 * links, while all newly created links use these canonical paths.
 */
export const SPIRALS_PATHS = {
  discovery: "/audio-spirals",
  room: (sessionId: string | number) => `/audio-spiral/${sessionId}`,
} as const;

type SpiralWithNeighborhood = { id: number; neighborhood_id?: number | null };

/**
 * Order Spirals using only server-verified location context:
 * 1. the verified current-neighborhood Spiral, when one is known;
 * 2. other neighborhood Spirals in their existing order;
 * 3. city-wide Spirals (null neighborhood_id) last.
 *
 * JavaScript's stable Array#sort is relied on so unrelated Spirals retain their
 * API order. No client GPS or heuristic neighborhood matching is performed here.
 */
export function orderSpiralsForLocation<T extends SpiralWithNeighborhood>(
  spirals: T[],
  localSpiralId: number | null | undefined,
): T[] {
  return spirals
    .map((spiral, index) => ({ spiral, index }))
    .sort((a, b) => {
      const aLocal = localSpiralId != null && a.spiral.id === localSpiralId;
      const bLocal = localSpiralId != null && b.spiral.id === localSpiralId;
      if (aLocal !== bLocal) return aLocal ? -1 : 1;

      const aCitywide = a.spiral.neighborhood_id == null;
      const bCitywide = b.spiral.neighborhood_id == null;
      if (aCitywide !== bCitywide) return aCitywide ? 1 : -1;

      return a.index - b.index;
    })
    .map(({ spiral }) => spiral);
}

/**
 * Backwards-compatible helper retained for existing callers.
 */
export function promoteLocalSpiral<T extends SpiralWithNeighborhood>(
  spirals: T[] | undefined,
  localSpiralId: number | null | undefined,
): T[] | undefined {
  if (!spirals) return spirals;
  if (localSpiralId == null || !spirals.some((spiral) => spiral.id === localSpiralId)) {
    return spirals;
  }
  return orderSpiralsForLocation(spirals, localSpiralId);
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
