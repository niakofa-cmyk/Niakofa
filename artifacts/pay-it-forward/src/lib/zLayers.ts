/**
 * zLayers.ts — named stacking-order constants for the map screen's chrome.
 *
 * Before this file, z-index values (z-10, z-20, z-[25], z-30, z-40, z-50,
 * z-[70]) were scattered as ad hoc Tailwind literals across TopBar.tsx,
 * map.tsx, MapControlsPanel.tsx, BottomSheet.tsx, and BestMatchCard.tsx.
 * That made the actual stacking order something you had to reverse-engineer
 * by grepping every file — and worse, a couple of inline comments describing
 * "why" a z-index was set had drifted out of sync with the real values,
 * so trusting a comment over the code was actively wrong in places.
 *
 * These are applied via inline `style={{ zIndex: ... }}` rather than Tailwind
 * `z-[${N}]` classes — Tailwind's JIT scanner only picks up literal class
 * strings from source, so an interpolated class name would silently fail to
 * generate any CSS in a production build. Inline style has no such gap.
 *
 * Ordering (low → high), matching what was already in effect before this
 * file existed — this is a rename/centralize pass, not a re-layering:
 *   Z_CHROME  (10) — status banners, live-stats pill, WebGL/token fallback,
 *                    requester FAB, screen-reader-only live region
 *   Z_TOPBAR  (20) — the TopBar row itself
 *   Z_SHEET   (20) — BottomSheet (helper-mode nearby list) — shares TOPBAR's
 *                    value because the two never spatially overlap (one
 *                    pinned to the top, the other to the bottom)
 *   Z_SEARCH  (25) — the expandable address-search bar + suggestion list
 *   Z_CARD    (30) — BestMatchCard — must stay visible above BottomSheet
 *                    even when the sheet is dragged open
 *   Z_CONTROLS(40) — the map-settings button, right-edge recenter/zoom/
 *                    orientation stack, and "Request Help Here" pill
 *   Z_NAV     (50) — BottomNav (fixed, opaque, always wins)
 *   Z_MODAL   (70) — full-screen modals (SOS)
 */
export const Z_CHROME = 10;
export const Z_TOPBAR = 20;
export const Z_SHEET = 20;
export const Z_SEARCH = 25;
export const Z_CARD = 30;
export const Z_CONTROLS = 40;
export const Z_NAV = 50;
export const Z_MODAL = 70;
