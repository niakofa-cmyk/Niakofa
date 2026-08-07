---
name: Niakofa map density-aware request clustering
description: How the map's Mapbox cluster radius adapts to how many open requests are on screen, and why a static radius was wrong.
---
- `map.tsx`'s `requests-cluster` GeoJSON `Source` used a fixed `clusterRadius={55}` regardless of how many open requests were loaded. A static radius either over-clumps a dense city into one giant blob (hiding neighborhood-level structure) or under-clumps a sparse/rural area into a field of never-grouped lone dots.
- Fixed with `dynamicClusterRadius` — a `useMemo` keyed on `openRequests.length` that steps the radius down as volume goes up: `<=8` → 70px, `<=25` → 55px (old default), `<=60` → 40px, else 28px.
- **Why:** the goal is readable structure at every density — few points should still visually group into a cluster bubble instead of scattering as isolated dots; many points should stay legible instead of merging into one undifferentiated mass.
- **How to apply:** if adding more granular density tuning later (e.g. per-zoom-level radius, or clustering by category), extend `dynamicClusterRadius`'s thresholds rather than reverting to a static number — the thresholds are tuned against total *visible* request count (post category/urgency filter), not the raw unfiltered set.
