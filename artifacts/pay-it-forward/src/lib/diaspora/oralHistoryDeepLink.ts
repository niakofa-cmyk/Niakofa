export type OralHistoryIntent = "oral-history" | "record" | "interview";

const PRESERVE_SCAN_KEY = "niakofa:diaspora:preserve-scan";
let preserveFetchBound = false;

/** Keep the user's preservation intent across the Family Space → recorder transition. */
export function persistPreserveScanContext(scanId: unknown): string | null {
  const id = Number(scanId);
  if (!Number.isInteger(id) || id <= 0 || typeof window === "undefined") return null;
  try { window.sessionStorage.setItem(PRESERVE_SCAN_KEY, String(id)); } catch {}
  return String(id);
}

export function readPreserveScanContext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(PRESERVE_SCAN_KEY);
    return value && /^\d+$/.test(value) ? value : null;
  } catch { return null; }
}

export function clearPreserveScanContext(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(PRESERVE_SCAN_KEY); } catch {}
}

/**
 * Bind a narrow browser-level bridge once the Family Vault/recorder module is
 * loaded. Existing recorder code creates the memory before it uploads audio;
 * observing that successful creation lets us attach the resolved Preserve scan
 * without forcing every recorder call site to know about Diaspora QR state.
 */
export function bindPreserveMemoryHandoff(): void {
  if (preserveFetchBound || typeof window === "undefined") return;
  preserveFetchBound = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const match = url.match(/\/api\/family\/(\d+)\/memories(?:\?|$)/);
      const scanId = readPreserveScanContext();
      if (method === "POST" && match && scanId && response.ok) {
        const payload = await response.clone().json() as { memory?: { id?: number } };
        const memoryId = Number(payload.memory?.id);
        const familyId = Number(match[1]);
        if (Number.isInteger(memoryId) && memoryId > 0 && Number.isInteger(familyId) && familyId > 0) {
          const token = (() => { try { return window.localStorage.getItem("niakofa_token"); } catch { return null; } })();
          const linkResponse = await originalFetch(`/api/diaspora/preserve/links/${scanId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ family_id: familyId, memory_id: memoryId }),
          });
          if (linkResponse.ok) clearPreserveScanContext();
        }
      }
    } catch {
      // The original memory response is never blocked or replaced by handoff errors.
    }
    return response;
  };
}

/** Send a user with a known family directly into that family's recorder tab. */
export function buildOralHistoryHref(familyId?: number | null): string {
  const scan = readPreserveScanContext();
  const suffix = scan ? `&preserve_scan_id=${encodeURIComponent(scan)}` : "";
  if (familyId != null && Number.isFinite(familyId)) return `/family/${familyId}?tab=record${suffix}`;
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

bindPreserveMemoryHandoff();
