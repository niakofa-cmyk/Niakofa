/**
 * Public Spirals routes. The legacy Circle routes remain supported for existing
 * links, while all newly created links use these canonical paths.
 */
export const SPIRALS_PATHS = {
  discovery: "/audio-spirals",
  room: (sessionId: string | number) => `/audio-spiral/${sessionId}`,
} as const;

/** Keep the server-verified local Spiral first without changing other order. */
export function promoteLocalSpiral<T extends { id: number }>(
  circles: T[] | undefined,
  localCircleId: number | null | undefined,
): T[] | undefined {
  if (!circles || localCircleId == null) return circles;
  const index = circles.findIndex((circle) => circle.id === localCircleId);
  if (index <= 0) return circles;
  const local = circles[index];
  return [local, ...circles.slice(0, index), ...circles.slice(index + 1)];
}

/**
 * Order the discovery list around the user's verified GPS neighborhood.
 *
 * Priority is deliberately explicit:
 *   1. server-verified local neighborhood Spiral
 *   2. every other neighborhood/city Spiral in the API's normal order
 *   3. city-wide Spiral(s) last
 *
 * A missing local match never invents one. A city-wide Spiral is identified
 * by a null neighborhood_id, matching the persisted Spiral schema.
 */
export function orderSpiralsForLocation<T extends { id: number; neighborhood_id?: number | null }>(
  spirals: T[] | undefined,
  localSpiralId: number | null | undefined,
): T[] | undefined {
  if (!spirals) return spirals;

  return [...spirals].sort((a, b) => {
    const aLocal = localSpiralId != null && a.id === localSpiralId;
    const bLocal = localSpiralId != null && b.id === localSpiralId;
    if (aLocal !== bLocal) return aLocal ? -1 : 1;

    const aCitywide = a.neighborhood_id == null;
    const bCitywide = b.neighborhood_id == null;
    if (aCitywide !== bCitywide) return aCitywide ? 1 : -1;
    return 0;
  });
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
