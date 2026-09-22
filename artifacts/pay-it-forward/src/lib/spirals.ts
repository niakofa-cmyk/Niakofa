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

export function filterActiveNeighborhoodSpirals<T extends SpiralWithNeighborhood>(spirals: T[]): T[] {
  const curated = spirals.filter((spiral) =>
    spiral.neighborhood_id == null ||
    spiral.source_kind === "niakofa_curated" ||
    spiral.source_kind === "curated"
  );
  const citywide = curated.filter((spiral) => spiral.neighborhood_id == null).slice(0, 1);
  const neighborhoods = curated.filter((spiral) => spiral.neighborhood_id != null).slice(0, 9);
  return [...citywide, ...neighborhoods];
}

/** Compatibility helper; the local GPS-derived id is intentionally ignored. */
export function orderSpiralsForLocation<T extends SpiralWithNeighborhood>(
  spirals: T[],
  _localSpiralId?: number | null,
): T[] {
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

/** Merge these helpers into the existing canonical spirals.ts. They preserve
 * the existing curated city/neighborhood discovery model; hubId is context only.
 */

export function spiralsDiscoveryPath(params: {
  neighborhood?: string;
  hubId?: string | number;
  city?: string;
} = {}): string {
  const q = new URLSearchParams();
  if (params.neighborhood?.trim()) q.set("neighborhood", params.neighborhood.trim());
  if (params.hubId !== undefined && String(params.hubId).trim()) q.set("hubId", String(params.hubId).trim());
  if (params.city?.trim()) q.set("city", params.city.trim());
  const suffix = q.toString();
  return suffix ? `/audio-spirals?${suffix}` : "/audio-spirals";
}

export function communitySpiralsPath(hubId?: string | number): string {
  if (hubId === undefined || !String(hubId).trim()) return "/community?tab=circles";
  return `/community?tab=circles&hubId=${encodeURIComponent(String(hubId).trim())}`;
}

export function parseSpiralHubId(search: string): number | null {
  const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("hubId");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
