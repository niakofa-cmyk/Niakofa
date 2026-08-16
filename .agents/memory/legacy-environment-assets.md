---
name: Legacy Environment Assets v1
description: 180 real hand-drawn environment PNGs wired into the renderer; asset registry, scene data, and scene renderer all in artifacts/pay-it-forward.
---

## Asset pack location
`artifacts/pay-it-forward/public/environment-assets/`
- `ground-tiles/` — 48 PNGs (6 categories × 8 variants: grass, dirt, path, cobble, sand, water-edge)
- `buildings-structures/` — 132 PNGs (12 categories × 11 variants: compound, hut, trading-house, church, mission-school, colonial-admin, fence, gate, wall, well, chest, market-stall)
- Atlas images (reference only, not loaded at runtime): `public/legacy-reference-docs/NIAKOFA-GROUND-TILES-ATLAS-v1.png` and `NIAKOFA-BUILDINGS-STRUCTURES-ATLAS-v1.png`

## Code files
- `src/lib/legacy-environment-assets.ts` — full typed registry + `getEnvAsset(id)` lookup + `WORLD_TILE_VISUAL` map (LegacyWorldTile → PNG)
- `src/lib/legacy-map-scenes.ts` — 3 hand-authored LegacyMapScene definitions (cape-coast-compound-1890, cape-coast-market-1905, cape-coast-harbour-1912)
- `src/components/legacy-scene-renderer.tsx` — `<LegacySceneRenderer scene tileSizePx showInteractions onInteract />` — renders all 5 layer kinds with real PNGs + lighting tint

## Key decisions
**Why WORLD_TILE_VISUAL uses a hash-seeded variant:** `tileVariant(type, row, col)` is deterministic — same cell always picks the same variant across re-renders and co-op sessions. Never call `Math.random()` for tile visual selection.

**Why LegacyMapLayerKind includes 'structure':** Fences/gates/walls are visually and semantically distinct from props (interactive objects). Extended the type rather than aliasing.

**Era → scene mapping (legacy-chapter.tsx):** `sceneIdForEra(era)` maps era strings like "1890s", "1905", "harbour" to scene IDs. When matched, `LegacySceneRenderer` renders as z-0 backdrop behind the walkable chapter world, with bottom gradient fade so text reads cleanly.

## Still missing (next pack needed)
- Tree/foliage PNGs (baobab_trunk, tree_canopy use CSS-only fallbacks)
- Interior tiles (house/trading-house interiors)
- Collapsed world-state variants (prosperous vs 1920 collapse)
- Animated sequences (water ripple loop, fire/torch)
- Natural features (rocks, tall grass as placeable props)
