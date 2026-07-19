---
name: Sankofa Bird project
description: Architecture, phase history, and key decisions for the Sankofa Bird SVG animation in artifacts/pay-it-forward/
---

## Project location
`artifacts/pay-it-forward/src/` — source only, no package.json or node_modules in the workspace.
Full monorepo lives on GitHub: `niakofa-cmyk/Niakofa`. Push with `gitPush({})`.

## Key files
- `src/components/SankofaBirdSvg.tsx` (~9,830 lines) — monolithic SVG bird: React state, inline CSS-in-JS `<style>` block, all `@keyframes` and `@property` declarations.
- `src/lib/sankofa-bird-math.ts` (329 lines) — pure math functions.
- `src/pages/bird-test.tsx` (~2,197 lines) — visual regression harness, one demo component per phase.
- `src/lib/__tests__/sankofa-bird.test.ts` (698 lines) — unit tests for math functions.

## Architecture: Props → data-attributes → CSS pipeline
React computes CSS vars (`--bank-angle`, `--flap-period`, `--lean-deg`, `--tail-bend`, `--gaze-x`, `--gaze-y`, `--head-lead-deg`, `--turn-intensity`, etc.) and data attributes (`data-flying`, `data-gliding`, `data-landing`, `data-gaze`, `data-turning`, `data-upcoming-turn`, `data-speed`, `data-zoom`, `data-sky-tier`, etc.) on `.sankofa-bird-rig`. All CSS animation gating hangs off these.

## Critical CSS composition rule
CSS individual transform properties (`rotate:`, `translate:`, `scale:`) compose ADDITIVELY with `transform:` shorthand (MDN rendering model). All phase CSS follows this pattern. `transform:skewX()` lives inside `transform:` shorthand only — there is NO `skewX:` standalone property. `@supports(skewX:0deg)` always evaluates FALSE.

## Gaze system
- `computeGazeVector` → `{gazeDirX, gazeDirY, gazeDir8}` — computes from bankDeg, upcomingTurn, landingPhase, speedMs, isHelping, approaching.
- **effectiveGazeDir8/X/Y** — merged in component: idle-scan overrides when perched+idle, computed gaze used when flying/navigating.
- `data-gaze` attribute on `.sankofa-bird-rig` drives all head/neck/beak CSS via P12.2, P12.3, P15.1, P15.2, P15.3.
- **Idle scan**: useEffect cycles through all 8 gaze directions every 3.5-6.5s when `isIdle && !batterySaver`. Makes perched bird look around autonomously.

## Phase summary
- P1-P9: Flight physics, LOD, banking, landing sequence, feather details.
- P10: Night-mode plumage.
- P11: Finalization gap closures (F1-F14).
- P12/P13: 8-direction gaze (eye/iris/catchlight, head rotate, neck rotate, body pre-lean, wing pre-extend, tail rudder).
- P14 (commit 1357ac4b): data-turning attribute, E7 coefficient boost, wing sweep P14.1-P14.5.
- **P15 (commit efc173b1)**: Bug fixes + full-body directional awareness (see below).

## Phase 15 changes (July 2026)

### Bug fixes delivered in this commit:
- **P12.13**: Was `@supports(skewX:0deg)` — always FALSE, entire block dead code. Fixed with correct `transform:skewX()` compounding bank + upcoming-turn arc.
- **P14.5**: Had redundant neck dart (P8.4 already does -1.15px); removed. Added `not([data-helping='true'])` guard to head dart (E2 helping crane stacks additively without it).

### New P15 features:
- **P15.1**: Gaze-driven neck arc. When data-gaze fires (any source: bank, upcoming-turn, idle scan), neck arcs via `transform:skewX()` toward gaze direction. 4deg lateral, 2.5deg diagonal. Flying: compounds with E8 bank-skew. Perched: standalone. Covers high/street/mid zoom, flying/not-flying.
- **P15.2**: Mid-zoom (10-13) gaze head+neck rotation at 60% amplitude of high/street. Was completely missing.
- **P15.3**: Beak vertical pitch from gaze. up/down gaze tilts beak ±2.5deg at street zoom.
- **P15.4**: Eye alive shimmer — opacity animation on catchlight (cannot use transform; P12.1 locks it with !important). Period from --blink-period.
- **P15.5**: Gaze-correlated wing micro-lift — outside wing highlight brightens 1.35x when bird gazes toward it.

## CSS selector specificity table (neck transform)
- E8 base (bank skew): `.rig[flying][zoom="high"]` = 3 attrs + rig + neck class = (0,4,0) wait, rig is NOT a class selector here — it's class selector sankofa-bird-rig. Let me redo: `.sankofa-bird-rig` is a class = (0,1,0). `[data-flying="true"]` = (0,1,0). `[data-zoom="high"]` = (0,1,0). `.sankofa-bird-neck` = (0,1,0). Total: (0,4,0).
- P12.13 fixed (upcoming-turn + bank compound): adds `[data-upcoming-turn="..."]` → (0,5,0). Overrides E8.
- P15.1 (gaze + bank compound): adds `[data-gaze="..."]` → (0,5,0). Ties with P12.13; later in file wins.

## LOD tiers
low (<10), mid (10-13), high (14-16), street (≥17).

## Banking decay
bankDeg decays to 0 after 700ms via setTimeout in the heading-change useEffect.

## Test command (not runnable here — source-only workspace)
`pnpm --filter @workspace/pay-it-forward run test`
