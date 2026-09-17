export type DiasporaHubDeepLink = {
  hubId?: string | number | null;
  hubName?: string | null;
};

export function diasporaHubHref(link: DiasporaHubDeepLink = {}) {
  const params = new URLSearchParams();
  if (link.hubId !== undefined && link.hubId !== null && String(link.hubId).trim()) {
    params.set("hub", String(link.hubId));
  } else if (link.hubName?.trim()) {
    params.set("hubName", link.hubName.trim());
  }
  const query = params.toString();
  return query ? `/diaspora?${query}` : "/diaspora";
}

export function normalizeDiasporaPath(pathname: string, search = ""): string | null {
  if (pathname !== "/globe" && pathname !== "/diaspora/heritage/globe") return null;
  const params = new URLSearchParams(search);
  const hub = params.get("hub");
  return diasporaHubHref({
    hubId: hub,
    hubName: hub ? null : params.get("hubName"),
  });
}