---
name: Niakofa SankofaBird Phase 20
description: 360° multi-view sprite system — front/side/back cross-fade, walking legs, reference image.
---

## What Phase 20 adds

Full 360° multi-angle bird system implemented July 21 2026.

### Architecture

Three bird sprites sit `position: absolute; inset: 0` inside `.sankofa-bird-rig` (which now has `position: relative`):
- **FrontView.tsx** — bird heading north (coming toward viewer): chest/undersurface, Sankofa backward-head, egg, legs
- **SideView** — existing full-detail side anatomy (unchanged, wrapped in a sprite div)
- **BackView.tsx** — bird heading south (flying away): dorsal wings, scapulars, wide 7-feather tail fan

### New files
- `SankofaBird/Navigation/ViewSelector.ts` — `computeViewOpacities(deg, hasHeading)` + `computeViewAngle()`
- `SankofaBird/Anatomy/FrontView.tsx` — self-contained SVG with per-instance `useId()` gradients
- `SankofaBird/Anatomy/BackView.tsx` — same pattern
- `public/sankofa-bird-reference.png` — 2MB reference image (16-angle turnaround, color palette, layer hierarchy)

### Modified files
- `Context.tsx` — added `viewAngle`, `frontOpacity`, `sideOpacity`, `backOpacity` to `BirdContextValue`
- `Bird.tsx` — imports `computeViewOpacities/computeViewAngle`; computes and passes them in ctx
- `Renderer.tsx` — three sprite divs with opacity controlled by context values; `data-view-angle` on rig div; `spriteTransition` suppressed in battery-saver
- `base.ts` CSS — Phase 20 section: sprite cross-fade, FV/BV wing flap keyframes, walking legs animation

### Zone map (computeViewOpacities)
```
Front      337.5°–22.5°    (N ± 22.5°)   opacity: {front:1, side:0, back:0}
NE trans    22.5°–67.5°    linear cross-fade front→side
E side      67.5°–112.5°   opacity: {front:0, side:1, back:0}
SE trans   112.5°–157.5°   linear cross-fade side→back
Back       157.5°–202.5°   (S ± 22.5°)   opacity: {front:0, side:0, back:1}
SW trans   202.5°–247.5°   linear cross-fade back→side
W side     247.5°–292.5°   opacity: {front:0, side:1, back:0}
NW trans   292.5°–337.5°   linear cross-fade side→front
```

### CSS animation classes
- `.sankofa-fv-wing-left` / `.sankofa-fv-wing-right` — front view wing flap
- `.sankofa-bv-wing-left` / `.sankofa-bv-wing-right` — back view wing flap
- `.sankofa-leg-left` / `.sankofa-leg-right` — shared across all 3 views; walking @ 0.55s, idle sway @ 2.6s
- `.sankofa-fv-neck` — idle neck flex for front view

### Invariants
1. `hasHeading: false` → `computeViewOpacities` returns `{front:0, side:1, back:0}` (no change until GPS arrives)
2. FrontView/BackView use `React.useId()` for gradient IDs — no uid prop needed
3. Both FV/BV have `className="sankofa-bird-body"` so the existing float animation applies to all 3 sprites
4. The scaleX flip (`.sankofa-bird-heading-wrapper`) is ONLY inside the SideView sprite — FV/BV are always symmetric
5. `position: relative` on rig div is set both as inline style (Renderer.tsx) and in CSS (Phase 20 section) — belt-and-suspenders
6. `willChange: opacity` is conditional on mid-transition state to avoid GPU waste on fully opaque/transparent sprites

**Why:** True 360° heading representation required for a navigation companion that shows the bird flying toward you, away from you, or sideways depending on compass direction.
