/**
 * mapStatus.ts — pure priority logic for the map screen's single top-center
 * status slot.
 *
 * Previously up to FOUR different things fought for the same top/center real
 * estate at different times (coverage banner, "Search this area", "Browsing
 * this area", "Online — waiting for requests") plus a "Resume Compass"
 * button hand-tuned to bottom-[322px] to avoid whatever else happened to be
 * on screen. One slot, one priority order, one thing shown at a time — the
 * messages take turns instead of each claiming their own bespoke position.
 *
 * Priority (highest first):
 *   1. Resume Compass — the user just manually rotated the map; that needs
 *      acknowledging before anything else.
 *   2. Search/Browsing this area — an active browsing-away state.
 *   3. Job in progress — actionable (they have somewhere specific to be),
 *      but ranked below the two states above that need immediate
 *      acknowledgment (a manual rotate, or an explicit "search this area"
 *      prompt they just triggered).
 *   4. Coverage banner — this area has no Community Pool yet.
 *   5. Helper-mode "waiting for requests" — lowest priority, purely idle.
 *
 * States 1–3 only apply once the interactive map is actually up (mapError
 * -free); the coverage banner and idle message are meaningful even on the
 * WebGL-fallback screen, so they aren't gated on mapError.
 *
 * Extracted as a pure function (no hooks, no refs) so it can be unit tested
 * and read independently of map.tsx's much larger render/data-fetching body.
 */

export type MapStatus =
  | { kind: "resume-compass" }
  | { kind: "search-this-area" }
  | { kind: "browsing-this-area" }
  | { kind: "active-job" }
  | { kind: "coverage-outside" }
  | { kind: "helper-waiting" }
  | null;

export interface ComputeMapStatusParams {
  mapError: boolean;
  orientMode: "heading-up" | "north-up" | "locked-north";
  followPaused: boolean;
  isOffCenter: boolean;
  searchCenter: unknown;
  showActiveJobBanner: boolean;
  coverageOutside: boolean;
  helperModeActive: boolean;
  openRequestsCount: number;
}

export function computeMapStatus(params: ComputeMapStatusParams): MapStatus {
  const {
    mapError, orientMode, followPaused, isOffCenter, searchCenter,
    showActiveJobBanner, coverageOutside, helperModeActive, openRequestsCount,
  } = params;

  if (!mapError && orientMode === "heading-up" && followPaused) return { kind: "resume-compass" };
  if (!mapError && isOffCenter && !searchCenter) return { kind: "search-this-area" };
  if (!mapError && !!searchCenter) return { kind: "browsing-this-area" };
  if (showActiveJobBanner) return { kind: "active-job" };
  if (coverageOutside) return { kind: "coverage-outside" };
  if (helperModeActive && openRequestsCount === 0) return { kind: "helper-waiting" };
  return null;
}
