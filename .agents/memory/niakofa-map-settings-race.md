---
name: Niakofa map settings race condition
description: Map Settings drawer glitch — two root causes, both fixed; documents the pattern to avoid future regressions.
---

# Map Settings Drawer — Two Root Causes of Glitching

## The Bugs

### 1. movestart race (map.tsx)
The `movestart` event fires when any touch causes map movement. A tap on "Map Settings" in the bird menu registers as a touch → the map pans slightly → `movestart` fires → sheets close — all before the AppContext useEffect has opened the sheet. Result: sheet flickers open and immediately closes, or never opens.

**Fix:** `settingsOpenedAtRef = useRef<number>(0)`. Wrapper callbacks (`handleFiltersSheetChange`, `handleLayersSheetChange`) record `Date.now()` when `open=true`. The `movestart` handler skips closing if `Date.now() - settingsOpenedAtRef.current < 600`.

### 2. vaul shouldScaleBackground (MapControlsPanel.tsx)
`vaul`'s Drawer defaults to `shouldScaleBackground={true}`, which tries to scale a DOM wrapper element when opening. On a full-screen map canvas there is no such wrapper, causing visual jitter / failed open animation.

**Fix:** Pass `shouldScaleBackground={false}` to the Drawer in MapControlsPanel.

## How to Apply
Any new bottom-sheet triggered from a map touch event needs both guards:
- A timestamp debounce ref if `movestart` can conflict with the open signal
- `shouldScaleBackground={false}` on any vaul Drawer rendered on a full-screen map canvas
