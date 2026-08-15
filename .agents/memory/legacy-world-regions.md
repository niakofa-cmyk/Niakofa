---
name: Legacy World Regions
description: 12-region world scaffold — current wiring state and what still needs to be connected.
---

## What exists
- `src/lib/legacy-world-regions.ts` — 12 `WorldRegion` entries, `RegionId` union, `getAccessibleRegions(phase)`, `getAvailableConnections(region, phase)`, `getWorldRegion(id)`, `getStartingRegion(phase: string) → RegionId`.
- `src/components/legacy-world-map.tsx` — 4×3 grid overlay, era-colored cells, accessible/locked states, portal indicators.
- `src/pages/legacy-demo.tsx` — `worldMapOpen` + `activeRegionId` state wired; Map tray button opens LegacyWorldMap.

## What is NOT yet connected (outstanding work)
1. **Tile renderer**: `LegacyLivingWorld` still receives `getLegacyWorldLayout()` (the static 9×6 house map). `activeRegionId` is tracked but not yet passed to the renderer — switching regions does not change the visible map.
2. **Region exit UI**: `getAvailableConnections(region, phase)` returns portal/direction exits but no portal tiles appear on the map edges in-game.
3. **Character Profile tab in Journal**: `LegacyCharacterProfile` component exists but is not yet wired into `LegacyDemoJournal` (no "Character" tab).

## Type notes
- `getStartingRegion(phase: string)` returns `RegionId` directly (a string union), NOT an object with `.id`.
- `LegacyAgeGroup = "adult" | "kid"` only. Map "teen" → "kid", "elder" → "adult" before passing to LegacyCharacterSprite.
- `availableOptions` must be declared BEFORE any `useMemo` that references it (forward-reference error otherwise).
