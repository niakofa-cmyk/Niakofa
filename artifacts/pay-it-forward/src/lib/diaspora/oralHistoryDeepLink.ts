export type OralHistoryIntent = "oral-history" | "record" | "interview";

/** Send a user with a known family directly into that family's recorder tab. */
export function buildOralHistoryHref(familyId?: number | null): string {
  if (familyId != null && Number.isFinite(familyId)) {
    return `/family/${familyId}?tab=record`;
  }
  return "/diaspora/family?intent=oral-history";
}

export function parseOralHistoryIntent(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const intent = (params.get("intent") || params.get("tab") || "").toLowerCase();
  return intent === "oral-history" || intent === "record" || intent === "interview";
}