export function exchangeListingId(search: string): number | null {
  const value = Number(new URLSearchParams(search).get("listingId"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function exchangeListingRoute(search: string, listingId: number | null, edit = false): string {
  const query = new URLSearchParams(search);
  query.delete("tab");
  query.delete("section");
  query.delete("edit");
  if (listingId === null) {
    query.delete("listingId");
    query.delete("pickupRequestId");
  } else {
    if (query.get("listingId") !== String(listingId)) query.delete("pickupRequestId");
    query.set("listingId", String(listingId));
    if (edit) query.set("edit", "1");
  }
  return `/community/exchange${query.size ? `?${query}` : ""}`;
}
