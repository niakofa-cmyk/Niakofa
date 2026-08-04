---
name: Niakofa SankofaBird Phase 23
description: Structural iridescence and feather depth — heading-reactive wing color shifts, per-feather depth gradients, bank burst, cascade shimmer. Current build phase is 23.
---

# SankofaBird Phase 23 — Structural Iridescence + Feather Depth

## The rule
Phase 23 adds heading-reactive CSS `filter` on `.sankofa-bird-wing-right` / `.sankofa-bird-wing-left`. Eight heading quadrants map to distinct hue-rotate values:
- N/NW: no filter (pure #0FE5D4)
- NE: hue-rotate(15deg) saturate(1.28) brightness(1.07)
- E: hue-rotate(20deg) saturate(1.35) brightness(1.10) — max cyan
- SE: hue-rotate(-12deg) — turquoise
- S: hue-rotate(-18deg) — emerald
- SW: hue-rotate(-24deg) — deep emerald
- W: hue-rotate(-28deg) — deepest emerald
- NW: hue-rotate(-8deg) — slight return

**Why:** filter on wing SVG path elements is GPU-composited; doesn't affect children (luminary overlays are siblings in the `<g>` rig). Transition is 0.55s ease for a natural "turning in air" feel.

**How to apply:** When adding new heading-reactive behavior, always gate on `:not([data-battery-saver="true"])` for animated variants and add a `@media (prefers-reduced-motion: reduce)` block that strips filter + animation.

## Feather depth gradients
Four linearGradients in Gradients.tsx (tip bright → base dark), IDs derived from bodyGradId:
- `${bodyGradId}-fo` — outer primaries (r5, r0, l5, l0)
- `${bodyGradId}-fm` — mid primaries (r1, r2, l1, l2)
- `${bodyGradId}-fi` — inner primaries (r3, r4, l3, l4)
- `${bodyGradId}-fs` — secondaries

Wings.tsx derives these IDs from `bodyGradId` the same way Gradients.tsx does. Variables named `featherOuterGradId`, `featherMidGradId`, `featherInnerGradId`, `featherSecGradId`.

## Fixed in this phase
- `@property --diagonal-pose-intensity` added to base.ts (was missing; used in phase-21.ts for skewX)

## Key animations
- `sankofa-bank-iri-flash` — brief 0.75s opacity surge on wing-luminary-*-a when `data-hard-bank="true"`
- `sankofa-bank-wing-flash` — brief 0.75s hue-rotate flash on wing surfaces when banking
- `sankofa-feather-cascade` — staggered per-feather brightness+hue-rotate during flight (r5→r0→r1→r2, each 7% period delayed)
- `sankofa-glide-iri-sweep` — 5.5s slow hue sweep across wing surfaces while gliding

## Resting ambient state changes
Wing luminary overlays: `opacity: 0.13` (was 0) and `0.09` for -b variants. Body luminary: `opacity: 0.38` ambient. Feather iri-edge: `opacity: calc(0.22 + lighting-factor * 0.54)`.
