# Niakofa Legacy — Environment Assets v1 Reference

**Pack:** `Niakofa_Environment_Assets_v1` (uploaded Aug 16 2026)
**Atlases:** `NIAKOFA-GROUND-TILES-ATLAS-v1.png` · `NIAKOFA-BUILDINGS-STRUCTURES-ATLAS-v1.png`
**Status:** 180 frames extracted, registered, and wired into the renderer

---

## What's In This Pack

### Ground Tiles (48 frames — 6 categories × 8 variants)

| Category | Asset IDs | CSS Fallback | Notes |
|---|---|---|---|
| GROUND-GRASS | `ground-grass-01` … `ground-grass-08` | `#2f4a1e` | Main terrain for the Mensah compound |
| GROUND-DIRT | `ground-dirt-01` … `ground-dirt-08` | `#7a4a26` | Red earth interior, cocoa rows |
| GROUND-PATH | `ground-path-01` … `ground-path-08` | `#8a6a3a` | Walkable paths, compound courtyards |
| GROUND-COBBLE | `ground-cobble-01` … `ground-cobble-08` | `#6e6259` | Cape Coast market street, colonial town |
| GROUND-SAND | `ground-sand-01` … `ground-sand-08` | `#c7ad7a` | Coastal harbour approach |
| WATER-EDGE | `water-edge-01` … `water-edge-08` | `#1c3a52` | Atlantic shore, river edges |

All ground tiles are 213×150px source, tileable (background-repeat: repeat).

### Buildings (66 frames — 6 categories × 11 variants)

| Category | Asset IDs | Narrative Role |
|---|---|---|
| BUILDING-COMPOUND | `building-compound-01` … `-11` | Mensah family home (main scene anchor) |
| BUILDING-HUT | `building-hut-01` … `-11` | Storage rooms, servants' quarters |
| BUILDING-TRADING-HOUSE | `building-trading-house-01` … `-11` | House of Mensah shop front |
| BUILDING-CHURCH | `building-church-01` … `-11` | Cape Coast coastal mission |
| BUILDING-MISSION-SCHOOL | `building-mission-school-01` … `-11` | Education + colonial presence |
| BUILDING-COLONIAL-ADMIN | `building-colonial-admin-01` … `-11` | District commissioner's office |

### Structures (33 frames — 3 categories × 11 variants)

| Category | Asset IDs | Use |
|---|---|---|
| STRUCTURE-FENCE | `structure-fence-01` … `-11` | Compound boundary |
| STRUCTURE-GATE | `structure-gate-01` … `-11` | Compound entrance |
| STRUCTURE-WALL | `structure-wall-01` … `-11` | Colonial / market street walls |

### Props (33 frames — 3 categories × 11 variants)

| Category | Asset IDs | Interaction |
|---|---|---|
| PROP-WELL | `prop-well-01` … `-11` | Dialogue trigger (daily life scenes) |
| PROP-CHEST | `prop-chest-01` … `-11` | Family Vault artifact reveals |
| PROP-MARKET-STALL | `prop-market-stall-01` … `-11` | Quest step, trading mechanic |

---

## File Locations

```
public/environment-assets/
  ground-tiles/           48 PNGs + manifest.json
  buildings-structures/   132 PNGs + manifest.json
  README.md               extraction notes

public/legacy-reference-docs/
  NIAKOFA-GROUND-TILES-ATLAS-v1.png       source atlas (reference only)
  NIAKOFA-BUILDINGS-STRUCTURES-ATLAS-v1.png
  NIAKOFA_ENVIRONMENT_ASSETS_v1.md        this file
```

---

## Code Integration

### Asset Registry
`src/lib/legacy-environment-assets.ts` — full typed registry + `getEnvAsset(id)` lookup.
Also exports `WORLD_TILE_VISUAL` — the mapping from `LegacyWorldTile` string types
(used by the world layout engine) to real PNG asset IDs. Handles deterministic
variant selection so the same tile type shows natural texture variation across
adjacent cells without runtime `Math.random()`.

### Scene Data
`src/lib/legacy-map-scenes.ts` — three hand-authored `LegacyMapScene` definitions:
1. **`cape-coast-compound-1890`** — Mensah family compound, ground+buildings+fence+gate+well+chest
2. **`cape-coast-market-1905`** — Cape Coast cobblestone market + Trading House + colonial admin + stalls
3. **`cape-coast-harbour-1912`** — Sandy shore + water edge + church + fence

### Scene Renderer
`src/components/legacy-scene-renderer.tsx` — `<LegacySceneRenderer scene={...} />` component.
Renders all 5 layers (ground → decoration → structure → building → prop → foreground)
using real PNG assets, with interaction point pulse rings when `showInteractions={true}`.
Includes lighting tint overlay per scene's declared time of day.

### Chapter World Upgrade
`src/components/legacy-chapter-world.tsx` — now uses `WORLD_TILE_VISUAL` for ground tile
PNG rendering instead of flat CSS colors. The walkable grid shows real hand-drawn
grass/dirt/path/cobble/sand/water-edge tiles for every cell.

---

## LegacyWorldTile → Asset Mapping

```
grass_01      → ground-grass-01…08 (hash-seeded variant)
grass_02      → ground-grass-01…08 (offset variant)
dirt_path     → ground-path-01…08
red_earth     → ground-dirt-01…08
sand          → ground-sand-01…08
water         → water-edge-01…08
compound_wall → structure-wall-01…08
fence         → structure-fence-01…08
market_stall  → prop-market-stall-01…08
thatch_roof   → building-hut-01…08
cobblestone   → ground-cobble-01…08  (new tile type)
tree_canopy   → CSS only (#16240f)   — no tree PNG in this pack
baobab_trunk  → CSS only (#5a3d1f)   — not in this pack
```

---

## What's Still Missing (Next Pack Needed)

Per the `ASSET_PIPELINE_ANALYSIS.md` roadmap:
- **Tree/foliage PNGs** — standalone palm trees, baobab sprites (freestanding prop, not background fill)
- **Interior tiles** — house/trading-house/school/church interiors
- **Collapsed world-state variants** — "prosperous" compound vs "1920 collapse" compound
- **Animated sequences** — water ripple loop, fire/torch loop (static water-edge exists ✓)
- **Natural features** — rocks, tall grass as placeable prop objects

---

## Atlas Extraction Notes (from README.md)

- Ground tiles atlas (2048×1024): label column 0–177px, then 8 equal frame columns (~213px), 6 rows of unequal height (measured directly, not assumed uniform)
- Buildings atlas (2752×1536): label column 0–343px, then 11 equal frame columns (219px each), rows very irregular (76px–181px) — required gutter-band detection, not uniform row division
- **Rule for future atlases:** do not assume uniform row height when the atlas mixes tall buildings with thin structural elements — measure per-file

---

*Last updated: Aug 16 2026*
