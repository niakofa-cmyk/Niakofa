# Niakofa Legacy — Living World Map: Frame Structure, Architecture, Infrastructure

## Two different "maps" — don't conflate them

The reference renders and environment concept boards show **two distinct systems** that both
get called "the map":

1. **The Living World Map (macro)** — one large painted overworld image (Ghana → ocean
   crossing → Liverpool → New York → Chicago) with tappable location pins, per-pin unlock
   state, and travel routes. This is closer to the Family Tree's Baobab than to a tile
   engine — it's navigation, not a playable space.

2. **Per-location playable scenes (micro)** — the actual walkable Cape Coast market street,
   the Mensah compound interior, etc. This is the tile-based `LegacyChapterWorld` / 
   `LegacyMapScene` — where the ancestor actually walks around.

They need different frame structures.

---

## 1. Macro: the Living World Map

This is a small number of **large painted panorama images**, not a frame grid. Structure:

```
worldMap.png              -- one painted overworld illustration, parallax-optional
worldMap.pins.json        -- pin coordinates as % of image width/height, not px
                              (keeps it resolution-independent across devices)
```

```ts
interface LegacyWorldMapPin {
  id: string;                 // "cape-coast", "liverpool", "chicago"
  xPct: number; yPct: number; // position on worldMap.png, 0-1
  label: string;
  year: string;               // "1912", "1930"
  unlockState: "locked" | "visited" | "current";
  linksToSceneId: string;     // -> a LegacyMapScene.id (the micro map)
}
```

Route lines between pins are drawn **procedurally** between pin coordinates, not baked into
the art — so new locations can insert a new pin and re-route without regenerating the whole
painting.

**Production need:** one painted overworld per act/era (a 1912 Gold-Coast-only map, a later
multi-continent map once migration chapters unlock) — small asset count, high illustration
effort per image.

---

## 2. Micro: per-location tile & prop frame structure

Use the same atlas production template that worked for Kwame character art:

```
Canvas: 2048 x 1024 (or clean multiple of tile size)
Grid: label column (approx 163px) + N tile/prop columns of equal width
Row groups: one per asset category, captioned exactly like:
            "GROUND-GRASS", "BUILDING-COMPOUND", "PROP-WELL"
Background: consistent checkerboard (near-white, low-saturation) — NOT true alpha
Tile unit: 64x64px, matching calibration-sheet.json worldUnit.tileSizePx
```

If future environment atlases follow this convention, `extract.py` is directly reusable —
same script, different source folder.

### What needs frame sequences (vs. single static images)

| Category | Frames needed | Why |
|---|---|---|
| Water (river/ocean edge) | 4-6 frame loop | Visible motion |
| Foliage in wind (palm, tall grass) | 3-4 frame loop | Subtle idle motion |
| Fire (torches, camp fire) | 4-6 frame loop | Camp fire prop |
| Weather overlays (rain, fog) | Particle-style tile loop, 6-8 frames | Already scoped in WorldPack/weather/ |
| Building world-state variants | NOT frames — separate static images per state | "Prosperous compound" vs "collapsed compound" is a swap, not an animation |

Everything else (ground tiles, wall segments, furniture, props) is a **single static tile**.

---

## 3. Layer architecture (already scaffolded in legacy-map-engine.ts)

```
ground → decoration → building → prop → foreground
```

| Layer | Content | Art type |
|---|---|---|
| ground | Tilesets – OUTDOORS grid (grass, dirt, path, stone, sand, water...) | 64×64 tiles, static |
| decoration | Flowers, rocks, small clutter | Static, on top of ground |
| building | Family compound, hut, trading house, mission school, church... | One static image per tile-multiple size, PLUS second image per worldStateVariant |
| prop | Interactive objects (chest, door, well bucket, notice board) | Static + LegacyInteractionPoint binding |
| foreground | Tree canopies, roof overhangs | Renders in front of player |

### World-state variants — infrastructure need, not art need

**Split these two axes correctly:**

- **Lighting/weather state** → `LegacyMapScene.lighting` + `.weather` → **runtime tint/overlay**
  over one base image. Morning/afternoon/evening/night/rainy = NOT five separate paintings.

- **Narrative world-state** (prosperous/collapsed/rebuilt) → `LegacyMapScene.worldStateVariant`
  → a genuinely **different source image**, swapped wholesale.

Conflating these would either 5× the art budget or flatten the story's visual impact.
Keep them as two separate axes.

---

## 4. Infrastructure to build (once real environment atlases exist)

1. **Generalize `extract.py`** into a shared `atlas-extract` tool that takes a source folder
   + the fixed-geometry grid spec — same flood-fill background removal, same manifest output.

2. **Extend `legacy-hand-drawn-assets.ts`'s registry** to cover `LegacyMapLayer.assetId`
   the same way it covers character `assetId` — one enforcement mechanism (`artTier` gate),
   two asset kinds (character, map layer).

3. **Scene composer format** — unlike character frames (one sprite, many animation states),
   a map scene is many tile/building/prop placements composed together:

```json
{
  "id": "cape-coast-market",
  "worldStateVariant": "1912-prosperous",
  "layers": [
    { "kind": "ground", "assetId": "tile-dirt-path", "x": 0, "y": 0, "widthTiles": 20, "heightTiles": 12 },
    { "kind": "building", "assetId": "building-trading-house", "x": 4, "y": 2 },
    { "kind": "prop", "assetId": "prop-market-stall", "x": 8, "y": 5 }
  ]
}
```

4. **Collision + interaction authoring** alongside scene JSON — every `building`/`prop`
   placement should optionally declare its `LegacyCollisionShape` and `LegacyInteractionPoint`
   inline, so placing a trading house and making it "solid" + "walk up to enter" is ONE
   authoring step.

---

## What's blocking this today

Nothing above needs new *code* architecture decisions — the map-engine scaffold already has
the right shape. What's actually blocking is **there is no environment atlas yet in the
Kwame-style gridded, labeled, sliceable format** — only the concept boards, which are single
flattened illustrations, not production tile sheets.

The path from here: commission/generate environment art in the grid convention specified
above, and the extraction + composer infrastructure is ready to receive it the moment it exists.

---

## LegacyWorldMapPins Implementation (Aug 2026)

The macro world map is implemented as `legacy-world-map-pins.tsx`:
- Renders a full-screen SVG canvas with procedural route lines between pins
- Pins show era label, lock state, and chapter link
- Procedural route lines are drawn as SVG `<path>` elements between pin coordinates
- Unlock states: locked (dimmed), visited (checkmark), current (glowing pulse)
- Selecting a pin shows a detail card with chapter entry button
