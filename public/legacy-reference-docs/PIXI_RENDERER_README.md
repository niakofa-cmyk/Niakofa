# Niakofa Legacy — PixiJS World Renderer

Swaps the CSS-grid-of-`<div>`s world renderer (from the walkable-chapter
patch) for real WebGL canvas rendering via PixiJS — same walkable-world
logic, same component name and props, drop-in replacement.

## Apply

```bash
git checkout -b pixi-world-renderer   # stack on top of your previous two patches
git apply --check niakofa-pixi-renderer.patch
git apply niakofa-pixi-renderer.patch
cd artifacts/pay-it-forward && pnpm install    # pulls in the new pixi.js dependency
```

If it doesn't apply cleanly, just replace
`artifacts/pay-it-forward/src/components/legacy-chapter-world.tsx` with the
copy in `files/`, and add `"pixi.js": "^8.6.0"` to
`artifacts/pay-it-forward/package.json`'s `dependencies` (also in `files/`
if you'd rather diff it by hand).

## What changed

**Only one file's internals changed** — `legacy-chapter-world.tsx`. The
component name, props (`LegacyChapterWorldProps`), and everything that
calls it (`legacy-chapter.tsx`) are untouched. Movement, collision, and
keyboard input logic are byte-for-byte the same as the CSS version — none
of that depended on how tiles were drawn.

What's actually different:
- Terrain is drawn once into a single `PIXI.Graphics` object instead of
  N `<div>` elements — cheaper, and the foundation for parallax/lighting
  layers later without a rewrite.
- Landmarks (scene markers) are `PIXI.Graphics` circles + `PIXI.Text`
  glyphs, redrawn only when progress changes (`activeSceneNumber` /
  `completedSceneNumbers`), not every frame.
- The character is now a real cropped sprite: it loads the same
  spritesheet image files the old CSS version used
  (`resolveWalkingAppearance()` → `layer.file`, from
  `legacy-character-engine.ts` — unchanged), as `PIXI.Texture`s, and crops
  each to the correct 48×48 frame for the current facing direction using
  `PIXI.Rectangle` — same visual result as the CSS
  `background-position` hack, properly texture-based this time.
- Loaded textures are cached at module scope (`textureCache`) so
  remounting the world (e.g. switching chapters) doesn't re-fetch the same
  spritesheet images.

Added `pixi.js@^8.6.0` to `artifacts/pay-it-forward/package.json`'s
`dependencies` — it wasn't in the repo anywhere before this.

## Verification

This one got more scrutiny than the previous patches, since it's the
first change built against an external library's actual runtime API
rather than just this codebase's own types. I didn't just syntax-check it
against fabricated types:

1. Installed real `pixi.js@8.6.0` in a scratch project and wrote a
   standalone script exercising every Pixi API call this file uses —
   `app.init()`, the `Graphics` fluent `.rect().fill()` /
   `.circle().fill().stroke()` chain, `new Text({...})`, `Assets.load()`,
   and `new Texture({source, frame})` for frame-cropping. Zero type
   errors against the real library.
2. Then type-checked the actual `legacy-chapter-world.tsx` file itself
   against real `pixi.js`, real `react`/`@types/react`, and the real
   sibling modules (`legacy-dynamic-world-layout.ts`,
   `legacy-world-layout.ts`) copied in unmodified. Zero errors, zero
   warnings, once `@types/react` was present.

That's a materially higher confidence level than "it parses" — it means
the actual PixiJS API surface this code calls is used correctly, not just
remembered correctly.

## What this does NOT do yet

- No parallax, weather particles, or lighting overlays — the renderer can
  now support them cheaply, but none are wired up in this patch. That's
  the natural next visual step now that the canvas foundation is real.
- Tiles are still flat colors, not art — same honest limitation as the
  CSS version, just on a canvas now instead of divs.
- I have not run this inside an actual browser (this environment can't
  launch one) — the verification above is the strongest static check
  achievable without one. Do a real browser smoke test before merging:
  open a chapter, confirm the canvas mounts, walk around, confirm the
  character sprite crops to the right frame per direction, and check the
  console for any runtime-only issues (e.g. CORS on the spritesheet
  image host) static checking can't catch.
