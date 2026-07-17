---
name: Niakofa SankofaBird final state
description: Complete capability inventory of SankofaBirdSvg.tsx — all props, animations, LOD tiers, street-zoom parity, cinematic enhancements — July 2026
---

## Street-zoom parity (ALL resolved as of July 17, 2026)

The file uses `data-zoom="street"` (mapZoom ≥ 17, LOD0) and `data-zoom="high"` (zoom 14-16, LOD1).
ALL `[data-zoom="high"]` rules that needed a `[data-zoom="street"]` duplicate now have one.

Key fixes applied over two sessions:
- `@property --angle-var` added (Safari 15.4 keyframe interpolation)
- Glow-layer, crown droop/alert/fan, wing shimmer, crown gold tint, reduced-motion neck/iridescence/tail: street added
- Wing-btm idle at `data-zoom="high"` (0.28 opacity) — previously invisible at LOD1
- Body-feather rows 4-11 at `data-zoom="high"` (0.12 opacity, 3.8s cycle) — major LOD1 gap closed
- Only intentional asymmetry: flying+high wing-btm = 0.35, flying+street = 0.48

## Cinematic enhancements added July 17, 2026

**SVG elements added:**
- `sankofa-chirp-ring-1` and `sankofa-chirp-ring-2` inside `<g className="sankofa-bird-head">` after the lower beak, anchored to beak tip (cx=2.2, cy=14.25 SVG coords)

**New CSS animations:**
- `sankofa-wing-salute-left` / `sankofa-wing-salute-right`: bilateral wing salute — right wing is asymmetric counter-balance (8° vs left's 42°), triggered on `data-nearby-user="true"`
- `sankofa-chirp-ring`: scale(0.5)→scale(5) fade, triggered on nearbyUser, notification, accepted, donated
- `sankofa-donated-body-shimmer`: warm gold drop-shadow distinct from teal celebrating shimmer
- `sankofa-tip-flutter`: rapid opacity jitter (0.15-0.18s) on l5/r5/l0/r0 at airplane speed
- `sankofa-shadow-celebrate`: ground shadow scaleX(1.0→1.22) when celebrating
- `sankofa-neck-mid-wander`: gentle neck wander at mid zoom (previously only high/street had S-curve)
- `sankofa-donated-body-shimmer` + donation egg ripple with gold stroke

**Per-primary feather cascade timing (high+street zoom):**
Each feather has `animation-delay: calc(var(--flap-period) * factor)`:
- l5/r5: 0%, l0/r0: 4%, l1/r1: 9%, l2/r2: 14%, l3/r3: 18%, l4/r4: 22%
- ls1/rs1: 27%, ls2/rs2: 32%, ls3/rs3: 36%, lc1/rc1: 40%
This creates the Primary→Secondary lag→Body-catches-up ripple from the design doc.

**LOD0 individual feather micro-iridescence (street+flying only):**
Each primary gets its own `hue-rotate(heading-deg * factor)`:
- l5/r5: 0.55×, l0/r0: 0.45×, l1/r1: 0.35× + glow, l2/r2: 0.25× + glow, l3/r3: 0.18×, ls1/rs1: 0.12×

**Wing-root banking flex:**
CSS `transition: transform 0.35s ease-out` on scapular elements at high/street with proper transform-box/origin so they settle smoothly when banking direction changes.

## Coverage fixes
- Battery-saver LOD3: body-feathers 4-11 and chirp rings now in the `display: none` list
- Reduced-motion @media: feathers 4-11, chirp rings, donated body shimmer, WingSalute right wing all suppressed
- Accepted + donated events now trigger chirp rings

## Important invariants
- `sankofa-wing-salute` keyframe name was renamed to `sankofa-wing-salute-left` — any reference to old name would break. Right wing uses `sankofa-wing-salute-right`.
- Chirp rings are inside `<g className="sankofa-bird-head">` group — they rotate/translate with the head, which is the correct anatomical attachment point.
- `@property --angle-var` is declared; no new @property declarations needed for the July 17 additions (all new keyframes use already-registered vars).
- TypeScript errors in tsc --noEmit are pre-existing lib/api-client-react build issues (TS6305), not caused by SankofaBirdSvg.tsx.
