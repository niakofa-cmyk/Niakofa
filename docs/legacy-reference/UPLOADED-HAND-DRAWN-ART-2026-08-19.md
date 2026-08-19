# Niakofa Legacy — uploaded hand-drawn art reference

**Reviewed:** 2026-08-19  
**Source repository:** `niakofa-cmyk/Niakofa`, `origin/main`  
**Purpose:** preserve the findings and provenance of the hand-drawn art wiring
bundle used for this production pass.

## Supplied materials reviewed

- `niakofa-hand-drawn-art-wiring.patch`
- `niakofa-hand-drawn-art-patch.zip`
- `Hand_Drawn_Envirnonment_Assets.zip`
- `Pasted--The-core-finding-your-uploaded-art-isn-t-missing-from-...txt`
- `archive-stale-niakofa-repo-fork.sh`

The duplicate uploads were byte-identical. The environment pack contains two
source atlases plus four reference images. The app already contains the
extracted runtime frames and the source atlases under
`artifacts/pay-it-forward/public/environment-assets/` and
`artifacts/pay-it-forward/public/legacy-reference-docs/`; the large archives
are intentionally not copied into the repository a second time.

## Verified findings

The live `/legacy/demo` map uses `legacy-living-world.tsx`. Before this pass,
its two tile grids loaded the older 13-image placeholder set from
`/legacy-world-assets/tiles/`, while the real environment registry was only
used by the secondary scene renderer. The gameplay systems (movement,
walkability, portals, landmarks, echoes, and restoration state) do not need to
change for this visual fix.

The public living-world grids now resolve hand-drawn ground frames through
`WORLD_TILE_VISUAL`, with deterministic variants per cell. Structure tiles
render a ground layer plus a proportion-preserving, bottom-anchored overlay.
`tree_canopy` and `baobab_trunk` intentionally retain their legacy sprites
because the supplied atlases do not contain freestanding vegetation.

## Remaining content gaps

These are asset/content gaps, not silently substituted wiring:

- freestanding trees, baobab foliage, rocks, and tall-grass props;
- interior tile sets for the named house, trading house, school, and church;
- prosperous/collapsed building-state variants;
- animated water and fire sequences.

The next art pack should follow the existing registry conventions and update
the explicit fallback set when vegetation becomes available.