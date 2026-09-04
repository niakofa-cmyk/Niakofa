export type OralHistoryIntent = "oral-history" | "record" | "interview";

const PRESERVE_SCAN_KEY = "niakofa:diaspora:preserve-scan";

/** Keep the user's preservation intent across the Family Space → recorder transition. */
export function persistPreserveScanContext(scanId: unknown): string | null {
  const id = Number(scanId);
  if (!Number.isInteger(id) || id <= 0 || typeof window === "undefined") return null;
  try {
    window.sessionStorage.setItem(PRESERVE_SCAN_KEY, String(id));
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; the URL handoff still works.
  }
  return String(id);
}

export function readPreserveScanContext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(PRESERVE_SCAN_KEY);
    return value && /^\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPreserveScanContext(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(PRESERVE_SCAN_KEY); } catch {}
}

/** Send a user with a known family directly into that family's recorder tab. */
export function buildOralHistoryHref(familyId?: number | null): string {
  const scan = readPreserveScanContext();
  const suffix = scan ? `&preserve_scan_id=${encodeURIComponent(scan)}` : "";
  if (familyId != null && Number.isFinite(familyId)) {
    return `/family/${familyId}?tab=record${suffix}`;
  }
  return `/diaspora/family?intent=oral-history${suffix}`;
}

export function parseOralHistoryIntent(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const intent = (params.get("intent") || params.get("tab") || "").toLowerCase();
  return intent === "oral-history" || intent === "record" || intent === "interview";
}

export function readPreserveScanIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("preserve_scan_id");
  return value && /^\d+$/.test(value) ? value : null;
}
