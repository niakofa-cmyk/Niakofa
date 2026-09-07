/**
 * Public Spirals routes. The legacy Circle routes remain supported for existing
 * links, while all newly created links use these canonical paths.
 */
export const SPIRALS_PATHS = {
  discovery: "/audio-spirals",
  room: (sessionId: string | number) => `/audio-spiral/${sessionId}`,
} as const;

/**
 * Keep the server-verified local Spiral first and city-wide Spirals last.
 * Objects without neighborhood_id keep their prior ordering, preserving
 * compatibility with older callers/tests that only provide ids.
 */
export function promoteLocalSpiral<T extends { id: number; neighborhood_id?: number | null }>(
  circles: T[] | undefined,
  localCircleId: number | null | undefined,
): T[] | undefined {
  if (!circles) return circles;

  const ordered = [...circles].sort((a, b) => {
    const aLocal = localCircleId != null && a.id === localCircleId;
    const bLocal = localCircleId != null && b.id === localCircleId;
    if (aLocal !== bLocal) return aLocal ? -1 : 1;

    const aCitywide = a.neighborhood_id != null ? false : undefined;
    const bCitywide = b.neighborhood_id != null ? false : undefined;
    if (aCitywide !== undefined && bCitywide !== undefined && aCitywide !== bCitywide) {
      return aCitywide ? 1 : -1;
    }
    return 0;
  });

  return ordered;
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
