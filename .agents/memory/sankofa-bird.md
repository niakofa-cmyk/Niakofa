---
name: Sankofa Bird project
description: Architecture, phases 1-16, CSS/TS pipeline, all confirmed bugs, push workflow. For the Niakofa navigation app.
---

## Project location
`artifacts/pay-it-forward/src/` — source only. Full monorepo on GitHub: `niakofa-cmyk/Niakofa`. Push with `gitPush({})` (OAuth), NOT `git push` (HTTPS auth fails).

## File inventory (7 files, 12 916 lines total)
| File | Lines | Role |
|---|---|---|
| `src/components/SankofaBirdSvg.tsx` | 10 158 | Monolithic SVG bird — React state + inline CSS-in-JS `<style>` block, all Phases 1-16 |
| `src/components/SankofaBird.tsx` | 19 | Backward-compat shim: `export { SankofaBirdSvg as SankofaBird }` |
| `src/components/NavigationBird.tsx` | 112 | Drop-in map marker — NavInput → useBirdNavigation → SankofaBirdSvg |
| `src/lib/useBirdNavigation.ts` | 272 | GPS/nav SDK → SankofaBirdProps; auto battery-saver; haversine approaching |
| `src/lib/sankofa-bird-math.ts` | 329 | Pure math functions (screen rotation, bank, flap, gaze, etc.) |
| `src/lib/__tests__/sankofa-bird.test.ts` | — | Unit tests for all math functions |
| `src/pages/bird-test.tsx` | 2 355 | Visual regression harness — all phases including P14/15/16 demos |

## Critical naming note
`SankofaBird` was renamed to `SankofaBirdSvg` during Phase development. `SankofaBird.tsx` is a 2-line re-export shim. All host imports use `{ SankofaBird }` from `@/components/SankofaBird`. Do NOT add logic to the shim.

## Architecture: Props → data-attributes → CSS pipeline
Props → React computes CSS vars (`--bank-angle`, `--flap-period`, `--lean-deg`, `--left-wing-extra`, `--right-wing-extra`, `--tail-bend`, `--head-lead-deg`, `--heading-deg`, `--speed-factor`, `--turn-intensity`, `--blink-period`, `--gaze-x`, `--gaze-y`, `--lighting-factor`) + data-attrs (`data-flying`, `data-gliding`, `data-landing`, `data-gaze`, `data-turning`, `data-upcoming-turn`, `data-speed`, `data-zoom`, `data-nav-lod`, `data-battery-saver`, `data-helping`, `data-off-screen`, `data-sky-tier`, `data-activity`, etc.) on `.sankofa-bird-rig`. All CSS gating hangs off these.

## TypeScript import rules — CRITICAL
`SankofaBirdSvg.tsx` and `NavigationBird.tsx` and `bird-test.tsx` MUST use named type imports from "react":
- `import type { CSSProperties } from "react"` — not `React.CSSProperties` (no React namespace imported)
- `import { ..., type ReactNode } from "react"` — not `React.ReactNode`
Do NOT import React as a namespace in these files. The new JSX transform doesn't need it. Using `React.X` without a namespace import causes TS2304 in strict mode.

## CONFIRMED BUGS FOUND AND FIXED — complete end-to-end audit

### Bug A: NavigationBird.tsx — `React.CSSProperties` without React import
**Fixed:** `import type { CSSProperties } from "react"`, use `CSSProperties` directly.

### Bug B: SankofaBirdSvg.tsx — 44x `React.CSSProperties` without React import
**Fixed:** Added `import type { CSSProperties } from "react"`, replaced all 44 `as React.CSSProperties` with `as CSSProperties`.

### Bug C: bird-test.tsx — `React.ReactNode` without React import
**Fixed:** `import { ..., type ReactNode } from "react"`, use `ReactNode` directly.

### Bug D: P16.1 curiosity head tilt — missing `:not([data-helping="true"])` guard
**Fixed:** All 8 P16.1 rules now have both `:not([data-flying="true"])` and `:not([data-helping="true"])` guards. Without the helping guard, P16.1 at (0,5,0) clobbered E2 helping-crane head transform at (0,3,0).

### Bug E: P16.5 navLod=2 — two dead CSS class names
**Fixed:** `sankofa-bird-body-shimmer` and `sankofa-bird-body-highlight` don't exist in SVG markup. Replaced with verified-real names: `sankofa-feather-ls1/ls2/ls3/rs1/rs2/rs3`, `sankofa-wing-scap-l1/l2/r1/r2`, `crown-feather`, `glow-layer`, `wing-left/right-highlight`. See SVG lines 1063-1076, 1143-1152.

### Bug F: SankofaBird.tsx missing — broken import in bird-test.tsx
**Fixed:** Created 2-line barrel re-export shim at `src/components/SankofaBird.tsx`.

### Bug G (critical): P16.2 committed-bank egg rules override existing analog pendulum
**Fixed:** P16.2 added `[data-turning="left"] .sankofa-bird-egg { rotate: 3.5deg }` at (0,3,0) but the existing analog pendulum (lines 7723-7743) is also at (0,3,0) written earlier → source-order tie: P16.2 won, replacing `calc(var(--bank-angle)*-0.18)` with a flat 3.5deg. Also a neutral-return rule at (0,5,0) interrupted analog tracking for bankDeg < 8. Both removed. P16.2 now contains ONLY the 2 anticipatory pre-swing rules at (0,4,0).

### Bug H: `--turn-intensity` CSS var set but never consumed (dead variable)
**Fixed:** Added `@property --turn-intensity { syntax: '<number>'; inherits: true; initial-value: 0; }`. Updated P14.1 wing-sweep, P14.2 body CoM, and P14.3 tail rudder to use `calc(var(--turn-intensity, 0) * Xpx)` — smooth proportional scaling (8° bank → ~32% of max, 25° → 100%) instead of binary 0px/Xpx step.

## CSS specificity traps to avoid
- **Source-order wins on ties**: If two rules for the same element+property are the same specificity, the LATER one wins. P16.2 egg vs analog pendulum was the canonical case.
- **`@supports (skewX: 0deg)` is always FALSE**: Individual `skewX:` is not a CSS property. Only `transform: skewX()` works. See P12.13 bug-fix comment at line 9241.
- **`rotate:` individual property in `@keyframes`**: NOT safe on Safari < 15.4. Use `transform: rotate()` inside keyframes only.
- **`transition:` on individual properties**: `transition: rotate 0.5s` only animates the individual `rotate:` property. `transition: transform 0.5s` only animates the `transform:` shorthand. Need both if using both systems.

## CSS composition rules (verified correct)
- `rotate:` + `translate:` + `scale:` individual properties compose additively with `transform:` shorthand on same element.
- P14.3 tail-outer uses `translate:` (rudder fan); P16.6 uses `rotate:` — different properties, compose additively. ✓
- P14.1 wing-sweep uses `translate:` (inside @supports translate) — composes with P12.5 translate cleanly. ✓
- P14.2 body uses `translate:` — composes with E7's `rotate:` on .sankofa-bird-body without conflict. ✓
- P16.6 neck: `translate: calc(-0.55px * speed-factor) calc(+0.4px * speed-factor)` at (0,5,0) overrides P8.4's (0,3,0). X preserved, Y added for headwind neck drop. ✓

## Egg pendulum system — two layers, no conflict
1. **Analog pendulum** (lines ~7723-7743): `rotate: calc(var(--bank-angle)*-0.18)` at (0,3,0). Physics-proportional. Always active when banking.
2. **P16.2 anticipatory** (~lines 9953-9965): `rotate: 2.0deg` at (0,4,0). Fires ONLY when `data-turning="none"` AND `data-upcoming-turn="left/right"`. Higher specificity overrides the 0-valued analog result when bankDeg=0.

## P14 intensity scaling — AFTER fix
`--turn-intensity = min(1, abs(bankDeg)/25)`. Registered as `@property <number>`.
- P14.1 wing-sweep max: `calc(var(--turn-intensity,0) * 1.4px)` — was binary 0/1.4px.
- P14.2 body CoM max: `calc(var(--turn-intensity,0) * 0.7px)` — was binary 0/0.7px.
- P14.3 tail rudder max: `calc(var(--turn-intensity,0) * 0.5px)` — was binary 0/0.5px.
- All reset rules (`data-turning="none"`) still use `translate: 0 0`. ✓
- All battery-saver rules use `translate: 0 0 !important`. ✓

## P16.1 curiosity head tilt — helping guard mandatory
All 8 P16.1 rules include BOTH `:not([data-flying="true"])` AND `:not([data-helping="true"])`. Without both, P16.1 at (0,5,0+) clobbered E2's helping-crane head transform at (0,3,0) during diagonal idle scan.

## Speed tiers and speedFactor
`getSpeedTier(speedMs)`: idle (0), walking (0-2], running (2-10], driving (10-50], airplane (>50).
`speedFactor = min(1, speedMs/15)`. At driving entry (10 m/s): 0.67 → nonzero wind compensation. At 15+ m/s: 1.0 (full effect).
`turningDir = "left"|"right"|"none"` fires when |bankDeg| ≥ 8°.
`turnIntensity = min(1, abs(bankDeg)/25)` — 0.32 at 8°, 1.0 at 25°.

## Verified-real SVG class names for navLod/P16.5 suppression rules
- Feathers: `sankofa-feather-ls1/ls2/ls3/rs1/rs2/rs3` (SVG lines 1063-1076), `sankofa-feather-lc1/rc1`
- Wing scap: `sankofa-wing-scap-l1/l2/r1/r2` (SVG lines 1143-1152)
- Wing highlight: `sankofa-bird-wing-left-highlight`, `sankofa-bird-wing-right-highlight`
- Other: `sankofa-glow-layer`, `sankofa-wing-joint`, `sankofa-beak-glint`, `sankofa-wing-covert-band`, `sankofa-crown-feather`, `sankofa-egg-thermal-inner/mid`
- **DEAD (do not use):** `sankofa-bird-body-shimmer`, `sankofa-bird-body-highlight` — not in SVG markup.

## Integration API
```tsx
// Hook pattern:
const birdProps = useBirdNavigation({ heading, speed, mapBearing, mapZoom,
  navigating, upcomingTurnDirection, isHelping, skyTier,
  userLat, userLng, destinationLat, destinationLng }); // auto-compute approaching
return <SankofaBirdSvg {...birdProps} />;

// Drop-in map marker:
<NavigationBird heading={gps.heading} speed={gps.speed}
  mapBearing={map.getBearing()} mapZoom={map.getZoom()}
  navigating={route.isActive} upcomingTurnDirection={route.nextTurn} />

// Step-bearing → named turn:
computeUpcomingTurn(step.bearing_before, step.bearing_after) // → "left"|"right"|null
```

## Phase summary
- P1–P9: Flight physics, LOD, banking, landing, feather details, night-mode.
- P10: Night-mode plumage.
- P11: Gap closures F1–F14.
- P12/P13: 8-direction gaze system.
- P14: data-turning, E7 boost, wing sweep (now intensity-scaled), body CoM (intensity-scaled), tail rudder (intensity-scaled), perched weight-shift.
- P15: P12.13/P14.5 bug fixes, idle scan JS, gaze neck arc, mid-zoom gaze, beak pitch, eye shimmer, wing micro-lift.
- P16: useBirdNavigation + NavigationBird, wingbeat jitter, curiosity head tilt, anticipatory-only egg pre-swing, WAIR flutter, P16.4 perf hardening, navLod=2 suppression, wind compensation.

## Known orphan keyframes (harmless)
186 @keyframes defined, 178 animation-name usages. 8 orphan keyframes exist (dead but harmless — browsers skip them silently). Do not remove without checking for dynamic animation injection.

## navLod timer — verified no leak
`setInterval(60_000)` in `useEffect([navigating])`. `clearInterval(id)` in cleanup. `navStartRef.current = null; setNavLod(0)` on stop. ✓

## Device compatibility
| Platform | Animation level |
|---|---|
| iOS 14.1+, Safari | Full — all @supports rotate/translate/scale active |
| iOS 12–14 | CSS animations + transform shorthand (individual props fall back) |
| iOS < 12 | Static SVG silhouette (animations skipped by @supports guards) |
| Android Chrome 85+ | Full |
| Android Chrome < 85 | Same as iOS 12–14 fallback |
| Battery < 20% (auto) | Battery-saver: teal silhouette + core motion |
| 30+ min session | navLod=2: GPU-heavy effects fade out gracefully |
