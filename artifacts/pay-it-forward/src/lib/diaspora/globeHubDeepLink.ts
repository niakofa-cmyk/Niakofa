/**
 * Shareable Globe hub links used by the Diaspora surfaces.
 */
const GLOBE_BASE = "/diaspora/heritage/globe";

export function globeHref(opts?: { hubId?: number | null; hubName?: string | null }): string {
  if (opts?.hubId != null && Number.isFinite(opts.hubId)) {
    return `${GLOBE_BASE}?hub=${encodeURIComponent(String(opts.hubId))}`;
  }
  if (opts?.hubName) {
    return `${GLOBE_BASE}?hubName=${encodeURIComponent(opts.hubName)}`;
  }
  return GLOBE_BASE;
}

export function parseGlobeHubQuery(search: string): { hubId: number | null; hubName: string | null } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawId = params.get("hub");
  const hubId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;
  return { hubId, hubName: params.get("hubName") };
}

export function resolveHubFromQuery<T extends { id: number; name: string }>(
  hubs: T[],
  query: { hubId: number | null; hubName: string | null },
): T | null {
  if (query.hubId != null) {
    const byId = hubs.find((hub) => hub.id === query.hubId);
    if (byId) return byId;
  }
  if (query.hubName) {
    const needle = query.hubName.trim().toLowerCase();
    const byName = hubs.find((hub) => hub.name.trim().toLowerCase() === needle);
    if (byName) return byName;
  }
  return null;
}