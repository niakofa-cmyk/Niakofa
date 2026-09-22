/**
 * Diaspora Hub semantics shared by the Globe and Hub messaging surfaces.
 *
 * Location/presence is not the same thing as Hub membership or representation.
 */

export type DiasporaHubContext = {
  id: number;
  name: string;
  display_name?: string | null;
  region?: string | null;
  hub_scope?: string | null;
  country_code?: string | null;
  subdivision_code?: string | null;
};

export function hubDisplayName(hub: Pick<DiasporaHubContext, "name" | "display_name">): string {
  return hub.display_name?.trim() || hub.name;
}

export function isUsStateHub(hub: DiasporaHubContext): boolean {
  return hub.hub_scope === "us_state" ||
    (hub.country_code?.toUpperCase() === "US" && Boolean(hub.subdivision_code));
}

export function hubScopeLabel(hub: DiasporaHubContext): string {
  return isUsStateHub(hub) ? "U.S. state Hub" : "Country Hub";
}

export function canSpeakAsHub(
  membershipStatus: string | null | undefined,
): boolean {
  return membershipStatus === "approved";
}

export function messageHubHref(
  sourceHubId?: number | null,
  targetHubId?: number | null,
): string {
  const params = new URLSearchParams();

  if (Number.isSafeInteger(sourceHubId) && (sourceHubId as number) > 0) {
    params.set("sourceHub", String(sourceHubId));
  }
  if (Number.isSafeInteger(targetHubId) && (targetHubId as number) > 0) {
    params.set("targetHub", String(targetHubId));
  }

  const query = params.toString();
  return query ? `/messages?mode=hub&${query}` : "/messages?mode=hub";
}

export type HubReference = { id: number | null; name: string | null };

export function parseHubReference(value: string | null): HubReference {
  if (!value) return { id: null, name: null };
  if (/^\d+$/.test(value)) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? { id, name: null } : { id: null, name: null };
  }
  const name = value.trim();
  return name ? { id: null, name } : { id: null, name: null };
}

export function resolveHubReference<T extends DiasporaHubContext>(
  hubs: T[],
  value: string | null,
): T | null {
  const reference = parseHubReference(value);
  if (reference.id != null) {
    return hubs.find((hub) => hub.id === reference.id) ?? null;
  }
  if (reference.name) {
    const needle = reference.name.toLowerCase();
    return hubs.find((hub) => (
      hub.name.trim().toLowerCase() === needle ||
      hubDisplayName(hub).trim().toLowerCase() === needle
    )) ?? null;
  }
  return null;
}