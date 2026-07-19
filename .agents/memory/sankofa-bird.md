---
name: Sankofa Bird project
description: Architecture, phase history, and key decisions for the Sankofa Bird SVG animation in artifacts/pay-it-forward/
---

## Project location
`artifacts/pay-it-forward/src/` — source only, no package.json or node_modules in the workspace.
Full monorepo lives on GitHub: `niakofa-cmyk/Niakofa`. Push with `gitPush({})`.

## Key files
- `src/components/SankofaBirdSvg.tsx` (~9,400 lines) — monolithic SVG bird: React state, inline CSS-in-JS `<style>` block, all `@keyframes` and `@property` declarations.
- `src/lib/sankofa-bird-math.ts` (329 lines) — pure math functions (computeGazeVector, computeBankAngle, computeWingExtras, computeTailBend, computeHeadLeadDeg, computeFlightMode, computeFlapPeriodMs, computeLeanDeg, getSpeedTier).
- `src/pages/bird-test.tsx` (2,197 lines) — visual regression harness, one demo component per phase.
- `src/lib/__tests__/sankofa-bird.test.ts` (698 lines) — unit tests for math functions.

## Architecture: Props → data-attributes → CSS pipeline
React computes CSS vars (`--bank-angle`, `--flap-period`, `--lean-deg`, `--tail-bend`, `--gaze-x`, `--gaze-y`, `--head-lead-deg`, `--turn-intensity`, etc.) and data attributes (`data-flying`, `data-gliding`, `data-landing`, `data-gaze`, `data-turning`, `data-upcoming-turn`, `data-speed`, `data-zoom`, `data-sky-tier`, etc.) set on `.sankofa-bird-rig`. All CSS animation gating hangs off these.

## Critical CSS composition rule
CSS individual transform properties (`rotate:`, `translate:`, `scale:`) compose ADDITIVELY with `transform:` shorthand (MDN rendering model). This is how E7 bank rotation stacks with E2 helping-crane transform and P8 glide pitch simultaneously — no conflict. All new phase CSS must follow this pattern.

## Phase summary
- P1-P9: Flight physics, LOD, banking, landing sequence, feather details.
- P10: Night-mode plumage.
- P11: Finalization gap closures (F1-F14).
- P12/P13: Real-time 8-direction gaze (eye/iris/catchlight translate + head/neck rotation + body pre-lean + wing pre-extension + tail rudder). Commit `5cc2c163`.
- **P14 (current)**: Biomechanical turn commitment. Commit `1357ac4b`. Details below.

## Phase 14 changes (July 2026)
New `data-turning="left|right|none"` attribute (fires at |bankDeg| >= 8°, distinct from `data-upcoming-turn` which is a nav preview).
New `--turn-intensity` CSS var (0-1 normalized bank magnitude).
**Why:** `data-upcoming-turn` is a forward-looking nav signal; `data-turning` is the REAL current bank from GPS heading change. CSS needed both to give anticipatory + reactive responses independently.

E7 coefficient increases (more readable biomechanical lean):
- Head: 0.20 → 0.24; Neck: 0.14 → 0.18; Body: 0.07 → 0.11; Chest/Back: 0.06 → 0.09
- E8 neck S-curve skewX: 0.42 → 0.52

New P14.1-P14.5 CSS (all @supports translate guarded, battery-saver + reduced-motion suppressed):
- P14.1: Wing sweep on data-turning (outside +1.4px, inside -0.6px)
- P14.2: Body lateral CoM commit (translateX ±0.7px into turn)
- P14.3: Tail cross-rudder asymmetric fan
- P14.4: Gaze-driven body weight-shift when perched (completes head→neck→body kinetic chain)
- P14.5: Airplane-speed aerodynamic dart (neck -1.0px, head -0.5px forward)

## LOD tiers
low (<10), mid (10-13), high (14-16), street (≥17).

## Banking decay
bankDeg decays to 0 after 700ms via setTimeout in the heading-change useEffect.

## Test command (not runnable here — source-only workspace)
`pnpm --filter @workspace/pay-it-forward run test`
