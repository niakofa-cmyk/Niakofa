---
name: Niakofa SankofaBird turnaround board
description: Location, structure, and generation approach for the official SVG asset pipeline reference doc.
---

## Rule
Turnaround board lives at: `artifacts/pay-it-forward/public/sankofa-bird-turnaround.html`
- Self-contained (no external deps, all inline SVG + CSS + JS)
- Uses JavaScript SVG builder functions (`bird()`, `tail()`, `wings()`, `body()`, `head()`, `legs()`) with actual path data from SankofaBirdSvg.tsx
- Gradient IDs are locally scoped per panel (id suffix prevents conflicts)

**Contents:**
- Row 1: 8 directional views (Front, Front 3/4 L/R, Left/Right Profile, Back 3/4 L/R, Back)
- Row 2: 7 perspective views (Top, Bottom, 4× diagonal, Cross/skeleton)
- Turn sequence: 12 steps using CSS matrix() transforms for 2.5D perspective illusion
- Wing deformation: 5 states (Up, Mid, Down, Braking/Forward, Glide/Back)
- Tail deformation: 4 states (Flare, Narrow, Folded/Braking, Stream/Glide)
- Info panels: Feather layer map, color palette, gradient system, layer hierarchy, pivot points, pipeline compatibility

**3D illusion technique:** Pure CSS `matrix(sx, 0, skewX, 1, tx, 0)` transforms + per-panel `leftScaleX/rightScaleX` options to foreshorten wings + `backOp/eyeOp/beakOp/eggOp` opacity props to show/hide front-vs-back elements.

**Reference image:** `public/SANKOFA_BIRD_PIPELINE_REF.png` (photorealistic AI render, uploaded by user as target reference).
