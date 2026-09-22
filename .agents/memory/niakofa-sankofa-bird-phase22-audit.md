---
name: Niakofa SankofaBird Phase 22 audit
description: Current build phase (22), CSS selector bugs fixed in phase-21.ts, authoritative tail-pose triggers, LOD gate for banking fan, test count.
---

# SankofaBird Phase 22 Audit — July 23 2026

## Current build phase
**Phase 22 (LUMINARY EDITION)** — CSS assembled from:
`base` → `phase-3-11` → `phase-12-13` → `phase-14-19` → `phase-20` → `phase-21` → `phase-22`

All assembled in `sankofa-bird-css/index.ts`.

## Test count
**433 tests pass** (`node --import tsx/esm --test` runner, NOT jest).

## Bugs fixed in this audit

### 1. `:not()` as descendant selector (Phase 21.6 + 21.8)
**Wrong:**
```css
.sankofa-bird-rig[data-speed="driving"][data-flying="true"]:not([data-gliding="true"])
  :not([data-battery-saver="true"]) .sankofa-bird-tail { ... }
```
The `:not([data-battery-saver="true"])` was placed as a *descendant* selector (space before it), not chained on `.sankofa-bird-rig`. This meant it matched *any descendant* that lacked the attribute — CSS saw it as a 3-level combinator chain, not a guard on the rig.

**Fixed:** Chain `:not()` directly on the rig selector:
```css
.sankofa-bird-rig[...]:not([data-battery-saver="true"]) .sankofa-bird-tail { ... }
```
Same bug existed in Phase 21.8 back-diagonal wing selectors (4 rules).

### 2. Empty dead selector blocks
Two empty `{ }` blocks (lines ~462-466 and ~491-495) were left over from a prior failed edit attempt. Removed.

### 3. Tail fan not keyed to authoritative `data-tail-pose`
**Gap:** Braking rectrix fan was only triggered by proxy states (`data-approaching`, `data-landing="slowflap"`, `data-landing="perch"`). The authoritative `data-tail-pose="folded"` attr (set by Bird.tsx) was not wired.

**Fix:** Used `:is(...)` to add `data-tail-pose="folded"` as an additional trigger.

### 4. New: `data-tail-pose="flare"` rectrix splay block
Added an independent rectrix fan block for `data-tail-pose="flare"` (wide steering turns). LOD-gated to `[data-zoom="mid/high/street"]` only — feather geometry at low zoom is too small to animate.

### 5. Banking rectrix fan LOD-gated
Added `:not([data-nav-lod="2"])` to all 8 banking rectrix selectors. At `navLod=2` (low zoom), the individual rectrix elements are not worth animating — reduces compositor work.

## Bird.tsx docstring
Updated from "Phase 1-19 animation effects" to "Phase 1-22" with full phase history summary.

## Test coverage extended
`sankofa-bird-animation.test.ts` header updated from "Phases 1-17" to "Phases 1-22". New describe blocks added for Phases 18-22 (inside wing tuck, head lead, SME physics, wing/tail pose, luminary heading quadrant).

## How to apply
- `data-tail-pose` on `.sankofa-bird-rig` is authoritative for deformation: use it in new CSS rules rather than relying solely on proxy states.
- Banking fan rules must always carry `:not([data-nav-lod="2"])` to suppress at low zoom.
- Any new `:not()` guard on `.sankofa-bird-rig` must be chained directly on the selector (no space before `:not`).
