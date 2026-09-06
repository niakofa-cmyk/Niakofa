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