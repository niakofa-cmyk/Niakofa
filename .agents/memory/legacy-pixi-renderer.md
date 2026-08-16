---
name: Legacy PixiJS Renderer
description: LegacyChapterWorld is now a real WebGL canvas via pixi.js — what changed, what did not, and what this unlocks.
---

## What changed
- `artifacts/pay-it-forward/package.json`: added `"pixi.js": "^8.6.0"` to `dependencies`
- `artifacts/pay-it-forward/src/components/legacy-chapter-world.tsx`: internals swapped from CSS `<div>` grid to PixiJS WebGL canvas

## Public API (UNCHANGED — zero caller changes required)
- Component name: `LegacyChapterWorld` (same)
- Props interface: `LegacyChapterWorldProps` (same — all fields identical)
- Caller: `legacy-chapter.tsx` was not touched at all

## What the PixiJS version does
- `app.init()` mounts a `<canvas>` into a `containerRef` div on first render
- Terrain: one `PIXI.Graphics` object drawn once into a static world layer — not N `<div>` elements per tile
- Landmarks: `PIXI.Graphics` circle + `PIXI.Text` glyph, redrawn only when `activeSceneNumber` / `completedSceneNumbers` changes — not every frame
- Character: loads real spritesheet PNGs from `resolveWalkingAppearance()` as `PIXI.Texture`s, cropped to `48×48` per facing direction via `PIXI.Rectangle(48, row*48, 48, 48)` — replaces the `background-position` CSS hack
- `textureCache: Map<string, Promise<Texture>>` at module scope — remounting the component (chapter change) doesn't re-fetch spritesheets
- Cleanup: `app.destroy(true, { children: true })` on unmount; `destroyed` flag guards async init
- App re-created only when `chapterId` or grid dimensions change

## What did NOT change
- Movement / collision / keyboard / d-pad input — identical to CSS version
- `resolveWalkingAppearance()` call and layer source — same character engine

## Unlocked by this renderer (future work)
- Parallax background layers — cheap now that terrain is a single Graphics draw
- Weather particle systems on the canvas (rain, harmattan dust) — overlay containers
- Smooth camera pan (translate the stage instead of centering tiles)
- Per-tile animated sprites (water ripple, fire/torch loops) — Animated sprite containers

## Known limitation
- Tiles still use flat TILE_COLOR hex values, not the 180 real PNGs from legacy-environment-assets.ts
  The next step is to use PIXI.Sprite with the asset registry textures instead of Graphics.fill()

## Verification boundary
Static type-check passes (0 errors). Real browser smoke test needed for:
- Canvas mount on first load
- CORS on spritesheet image paths
- Character sprite crops to correct direction on walk
