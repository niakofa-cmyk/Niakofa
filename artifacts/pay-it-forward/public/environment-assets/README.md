# Niakofa Legacy — Environment Asset Pack v1 (extracted)

First real hand-drawn environment assets, produced in exactly the grid
convention specified in `WORLD_MAP_ARCHITECTURE.md` — and it worked cleanly,
same as Kwame's atlas. **180 real transparent frames extracted: 48 ground
tiles + 132 buildings/structures/props, all visually verified.**

## What was fixed during extraction (worth knowing)

Unlike Kwame's atlases, these two files don't share a common template with
each other or with Kwame's — each needed its own measured grid:

- **`ground-tiles`** (2048×1024): label column 0–177, then 8 equal frame
  columns (~213px), 6 rows. Rows are *not* equal height (186 down to 149px) —
  measured directly rather than assumed uniform.
- **`buildings-structures`** (2752×1536): label column 0–343, then 11 equal
  frame columns (219px each) — but rows are **very irregular** (76px to
  181px). Building/compound rows are much taller than fence/wall/prop rows.
  A uniform-division first attempt produced visibly misaligned crops (a
  building row's art bleeding into the next label); fixed by detecting true
  near-zero-content gutter bands between rows and snapping to those instead
  of assuming equal heights. Worth remembering for the next atlas: **don't
  assume uniform row height across an atlas that mixes tall buildings with
  thin structural elements** — measure per-file.

## Contents

```
ground-tiles/           48 frames -- 8 variants each of grass, dirt, path,
                          cobblestone, sand, water-edge
buildings-structures/   132 frames -- 11 variants each of:
                          compound, hut, trading-house, church,
                          mission-school, colonial-admin (buildings)
                          fence, gate, wall (structures)
                          well, chest, market-stall (props)
```

All static single-frame tiles (no animation needed for any of these per
`WORLD_MAP_ARCHITECTURE.md`'s frame-vs-static breakdown — water animation
would need a separate frame-sequence pass, not covered by this static-tile
atlas).

## Direct mapping into `legacy-map-engine.ts`

Every extracted file becomes one `LegacyMapLayer.assetId`:

```ts
{
  assetId: "ground-grass-03",
  kind: "ground",
  artTier: "handDrawn",
  file: "ground-tiles/ground-grass-03.png",
}
{
  assetId: "building-compound-01",
  kind: "building",
  artTier: "handDrawn",
  file: "buildings-structures/building-compound-01.png",
  // register matching LegacyCollisionShape + LegacyInteractionPoint
  // separately when placed in a scene -- art and gameplay data are decoupled
}
```

The 8/11 numbered variants per category (`ground-grass-01` through `-08`,
etc.) exist specifically so a hand-authored scene doesn't visibly tile-repeat
— vary the variant index across a ground area the same way real grass has
natural texture variation.

## What this unlocks right now

Enough to hand-author the **first real `LegacyMapScene`** — e.g. a Cape
Coast compound scene: `ground-grass`/`ground-path` for terrain,
`building-compound` for the family home, `structure-fence` for the
boundary, `prop-well` in the yard. That's the "real playable scene" gap
flagged all the way back in `BUGS_AND_FINDINGS.md` — this pack is the art
half of closing it. The engineering half (a renderer component in
`legacy-chapter.tsx` reading a `LegacyMapScene` JSON and drawing these
layers) is still the next build step, per `ARCHITECTURE_PLAN.md` §3.

## Still missing for a full location set

- Interiors (per the environment concept board: house/trading-house/school/
  church interior tiles) — not in either atlas yet
- Natural features beyond ground tiles: standalone trees, rocks, vegetation
  as placeable props (the concept board's "NATURAL FEATURES" / "VEGETATION"
  panels) — these two atlases cover ground textures and buildings, not yet
  freestanding foliage/prop objects
- Animated water, fire, weather frame sequences (static water-edge tile
  exists; a looping animation set does not)
- World-state variants (a "collapsed" building atlas) — everything extracted
  here is the "prosperous" state only
