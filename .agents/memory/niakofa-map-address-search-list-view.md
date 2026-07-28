---
name: Niakofa map address search + list view
description: Forward geocoding search box and sortable accessible list view added to the map page; where they live and how they interact with the map.
---

- Forward address search (Mapbox Geocoding API, 400ms debounce, proximity-biased) lives directly in `map.tsx`, ported from `request-new.tsx`'s existing pattern rather than duplicating a new one. Selecting a suggestion both `flyTo`s and immediately sets it as the effective search center (skips the separate "Search this area" step since intent is already explicit).
- `TopBar` gained optional props (`onSearchToggle`/`searchActive`, `viewMode`/`onToggleView`) so map-only controls can live in the shared chrome without new consumers being affected — `TopBar` still only has one consumer (`map.tsx`).
- `viewMode: "map" | "list"` in `map.tsx` fully swaps the map/BestMatchCard/BottomSheet/mapError-fallback/FAB for a full-screen `RequestListView` — the list view works with no WebGL and no Mapbox token, serving as the accessibility-friendly alternative to precise pin-tapping.
- Extracted the per-request card markup that used to be duplicated risk into a shared `RequestCard` component, used by both `BottomSheet` and `RequestListView` — keep using this component for any future request-card UI instead of re-copying the JSX.
- **Why:** doc-driven review flagged that map-pin-tapping alone excludes some users (small touch targets, motor/screen-reader constraints), and that there was no way to jump to a typed address on the map view (only reverse-geocoding existed).
