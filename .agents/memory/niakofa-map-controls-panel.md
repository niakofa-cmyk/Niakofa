---
name: Niakofa map controls redesign (settings button + right stack)
description: Final layout convention for map.tsx's floating controls, the zLayers.ts z-index constants, and the collapsed live-stats pill pattern — read before touching MapControlsPanel.tsx, map.tsx overlay chrome, or BestMatchCard/BottomSheet positioning.
---

## Control layout convention
- `MapControlsPanel.tsx` is now split into two fixed groups, NOT one shared icon strip:
  - Bottom-LEFT: one round "Map settings" button (mirrors BottomNav's notification-bell size/position/perch, opposite corner) opening a single merged Drawer with filters + language + layers + legend.
  - Bottom-RIGHT: a vertical stack of round icon buttons — orientation (icon-only, no text label), recenter, zoom-in (+), zoom-out (−).
- Both groups share a `PERCH_BOTTOM` offset matching the bell's floating perch above BottomNav.
- **Why:** user explicitly asked to consolidate Filters/Layers into one alerts-bell-styled button, move Recenter + explicit zoom buttons back to the right edge, and make Orientation icon-only. Don't reintroduce the old always-visible 4-icon shared strip.
- `OrientationToggle.tsx` takes an `iconOnly` prop for this; the original text-pill rendering still exists for any other caller.

## z-index constants
- `src/lib/zLayers.ts` exports `Z_CHROME(10) < Z_TOPBAR/Z_SHEET(20) < Z_SEARCH(25) < Z_CARD(30) < Z_CONTROLS(40) < Z_NAV(50) < Z_MODAL(70)`.
- Applied via inline `style={{ zIndex }}`, NOT Tailwind `z-[${N}]` — Tailwind's JIT can't discover interpolated class names, so that approach silently drops the CSS in production builds.
- **How to apply:** any new floating map-screen chrome should import a constant from this file rather than hardcoding a Tailwind z-class.

## Collapsed live-stats pill
- The top-right live-stats overlay in `map.tsx` is a single collapsed pill (`statsExpanded` state, connection dot + open-request count + emergency flag) that expands on tap into the full breakdown (helper count, en-route, LastUpdated). Replaced the old always-visible 5-pill stack + "tap to hide forever" pattern (which had no way back once dismissed).
- `mapStatus` banner uses `right-20` (not the old `right-24`) now that the stats area is a single narrower pill.

## Other related fixes in the same pass
- `BestMatchCard` is `right-16` (not `right-3`) so it clears the new right-edge control stack.
- Reverse-geocoding coverage-match effect in `map.tsx` has a real 600ms `setTimeout` debounce now, not just `.toFixed(2)` dep-array rounding (rounding alone still fired a burst of Mapbox geocoding calls while panning fast).
- The Mapbox `contextmenu` (long-press) handler now calls `e.originalEvent?.preventDefault?.()` explicitly.

## controlsRecede — settings button + right stack must recede when the helper-mode sheet expands
- The right-edge stack grew from one shallow row to a 4-button vertical stack, so `BottomSheet`'s 55vh expanded state now runs underneath most of its height, not just its tip — both floating groups would otherwise sit on top of the request-card list, blocking claim buttons.
- Wiring: `BottomSheet` takes `onExpandedChange?: (expanded: boolean) => void`, fired from a `useEffect` on its own `expanded` state (fires on mount too). `map.tsx` mirrors this into a `sheetExpanded` state and passes `controlsRecede={sheetExpanded && helperModeActive && openRequests.length > 0}` into `MapControlsPanel`. Both the settings button and the right-edge stack fade + slide off-screen and go inert (`pointer-events-none`, `aria-hidden`, `tabIndex={-1}`) while receding, reappearing instantly on collapse.
- **Why not just lower their z-index below the sheet:** that would bury them under the sheet's opaque background instead of keeping them reachable the instant it collapses — recede-and-reappear was the deliberate choice over a z-index fix.
- **How to apply:** any new floating map-screen control group that can end up over the expanded BottomSheet should also consume `controlsRecede` rather than inventing its own overlap fix.
- Also added `hiddenEmergencyCount` prop on `MapControlsPanel`: an active category/urgency filter can silently drop an emergency pin off the map even though the stats pill still counts it; surfaced as a destructive pulsing badge on the settings button + a "N emergency hidden — Clear" nudge inside the settings sheet.
- `mapStatus` priority logic was extracted to a pure `computeMapStatus()` in `src/lib/mapStatus.ts` (no hooks/refs) — read there for the state-priority order instead of map.tsx's render body.
