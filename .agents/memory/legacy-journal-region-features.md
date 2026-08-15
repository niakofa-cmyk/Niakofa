---
name: Legacy Journal + Region Features
description: Task 7 (region map renderer), Task 8 (character journal tab), Task 9 (journal sanitizer) shipped in commit f9a835b1.
---

## Task 7 — RegionMap in LegacyLivingWorld

`LegacyLivingWorld` now accepts `activeRegionId?: RegionId` and `onRegionChange?: (regionId: RegionId) => void`.

When `activeRegionId` is set, a `RegionMap` sub-component renders instead of `HouseOfMensahMap`. `RegionMap`:
- Gets the `WorldRegion` from `getWorldRegion(regionId)` (WORLD_REGION_REGISTRY lookup)
- Renders the 6×9 tile grid using the same `TILE_ROOT` tile images
- Shows portal exits as violet `⬡` buttons at the `exitRow/exitColumn` of each `RegionConnection`; clicking navigates to the target region via `onRegionChange`
- Shows story event markers as gold sparkle icons
- Shows portal list as clickable buttons below the grid
- Accepts arrow-key/WASD input; moving onto a portal tile also triggers navigation

**Wire-in:** `legacy-demo.tsx` already has `activeRegionId` and `worldMapOpen` state — just pass `activeRegionId` to `LegacyLivingWorld` when the map tray is open.

## Task 8 — Character tab in LegacyDemoJournal

`LegacyDemoJournal` now has `activeTab: "journal" | "character"` internal state with two tab buttons in the header.

- **Journal tab** — existing content unchanged (life skills, quests, memory log, discoveries)
- **Character tab** — renders `LegacyCharacterProfile` using the journal's `phase`, `traits`, and new `characterId?: string` prop (defaults to `"kwame-mensah"`)

## Task 9 — Journal sanitizer resilience

`readDemoState` journal sanitizer now:
1. **Counts and logs dropped entries** in dev/non-production (`console.warn` on `droppedCount > 0`)
2. **Preference-aware cap:** when over 200 entries, keeps all conversations first (up to 200), then discoveries, then trait-gains — newest first within each type. Previously just `slice(-200)`.
3. **Three new unit tests** in `legacy-demo-state.test.ts` under `"Journal sanitizer resilience (Task 9)"`.

**Why preference order matters:** conversation entries are player-meaningful NPC memories that contextualize the world; trait-gains are passive skill-point bookkeeping. Losing a trait-gain is less harmful than losing a dialogue memory.
