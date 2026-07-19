---
name: Sankofa Bird project
description: Architecture, phase history, CSS/TS pipeline, confirmed bugs, and push workflow for the Sankofa Bird SVG animation in artifacts/pay-it-forward/
---

## Project location
`artifacts/pay-it-forward/src/` — source only. Full monorepo on GitHub: `niakofa-cmyk/Niakofa`. Push with `gitPush({})`.

## File inventory (7 files, 13 228 lines total)
| File | Lines | Role |
|---|---|---|
| `src/components/SankofaBirdSvg.tsx` | 10 141 | Monolithic SVG bird — React state + inline CSS-in-JS `<style>` block |
| `src/components/SankofaBird.tsx` | 19 | Backward-compat shim: `export { SankofaBirdSvg as SankofaBird }` |
| `src/components/NavigationBird.tsx` | 112 | Drop-in map marker — NavInput → hook → SankofaBirdSvg |
| `src/lib/useBirdNavigation.ts` | 272 | GPS/nav SDK → SankofaBirdProps; auto battery-saver; haversine approaching |
| `src/lib/sankofa-bird-math.ts` | 329 | Pure math functions |
| `src/lib/__tests__/sankofa-bird.test.ts` | — | Unit tests for math functions |
| `src/pages/bird-test.tsx` | 2 355 | Visual regression harness — all phases including P14/15/16 demos |

## Critical naming note
`SankofaBird` was renamed to `SankofaBirdSvg` during Phase development. `SankofaBird.tsx` is a 2-line re-export shim. Do NOT add logic to the shim. All host imports use `{ SankofaBird }` from `@/components/SankofaBird`.

## Architecture: Props → data-attributes → CSS pipeline
Props → React computes CSS vars (`--bank-angle`, `--flap-period`, `--gaze-x/y`, `--turn-intensity`, `--speed-factor`, etc.) + data-attrs (`data-flying`, `data-gaze`, `data-turning`, `data-upcoming-turn`, `data-speed`, `data-zoom`, `data-nav-lod`, `data-battery-saver`, `data-helping`, `data-off-screen`, etc.) on `.sankofa-bird-rig`. All CSS gating hangs off these attributes.

## CONFIRMED BUGS FOUND AND FIXED — full audit

### Bug A: NavigationBird.tsx — React.CSSProperties without React import
`React.CSSProperties` used as type annotation but React never imported. Fix: `import type { CSSProperties } from "react"`.

### Bug B: P16.1 curiosity head tilt — missing :not([data-helping="true"]) guard
P16.1 at (0,5,0) clobbered E2 helping-crane head transform at (0,3,0) whenever idle-scan hit a diagonal direction while helping. Added `:not([data-helping="true"])` to all 8 P16.1 selectors (4 tilt + 4 reset rules).

### Bug C: P16.5 navLod=2 — dead CSS class names
`sankofa-bird-body-shimmer` and `sankofa-bird-body-highlight` don't exist in SVG markup. Replaced with verified-real names: `sankofa-feather-ls1/ls2/ls3/rs1/rs2/rs3`, `wing-left/right-highlight`, `wing-scap-l1/l2/r1/r2`, `crown-feather`, `glow-layer`, `egg-thermal-inner/mid`. See SVG lines 1063-1076 and 1143-1152.

### Bug D: Missing SankofaBird.tsx — broken import in bird-test.tsx
`bird-test.tsx` imports `{ SankofaBird }` from `@/components/SankofaBird` which didn't exist. Created 2-line barrel re-export shim.

### Bug E (critical): P16.2 committed-bank egg rules override existing analog pendulum
P16.2 added `[data-turning="left"] .sankofa-bird-egg { rotate: 3.5deg }` at specificity (0,3,0). The existing analog pendulum (lines 7723-7743) is ALSO at (0,3,0) but written earlier. CSS source-order tie-breaking meant P16.2 SILENTLY won — replacing `calc(var(--bank-angle)*-0.18)` (physics-proportional) with a coarse 3.5deg fixed value.
Also: the P16.2 neutral-return rule at (0,5,0) interrupted analog tracking for bankDeg < 8 (where data-turning="none" but analog has a live value).
Fix: removed committed-bank and neutral-return rules. Kept ONLY the 2 anticipatory pre-swing rules `[data-turning="none"][data-upcoming-turn="left/right"]` at (0,4,0).

## CSS specificity traps to avoid
- **Source-order wins on ties**: If two rules for the same element+property resolve to the same specificity, the LATER one wins. P16.2 was at (0,3,0) same as existing analog pendulum but later → silently won. Always check existing rules before adding new ones on the same element.
- **`@supports (skewX: 0deg)` is always FALSE**: Never use; individual `skewX:` does not exist as a standalone CSS property. Only `transform: skewX()` works. See P12.13 bug-fix comment at line 9241.
- **`rotate:` vs `transform: rotate()`**: Both can set rotation on the same element and they compose additively (individual property + shorthand both apply). But if TWO rules set `rotate:`, only the higher-specificity/later one wins.
- **Individual transform properties in @keyframes**: `rotate:`, `translate:`, `scale:` as individual properties are NOT safe inside `@keyframes` on Safari < 15.4. Use `transform:` shorthand inside keyframes only.

## Critical CSS composition rules
- `rotate:` + `translate:` + `scale:` individual properties compose ADDITIVELY with `transform:` shorthand on same element.
- P14.3 tail-outer uses `translate:` (rudder fan); P16.6 uses `rotate:` on same elements — different properties, compose additively, no conflict. ✓
- P16.6 neck: extends P8.4's formula. P8.4 at (0,3,0) sets `translate: calc(-0.55px * speed-factor) 0`. P16.6 at (0,5,0) overrides with `calc(-0.55px * speed-factor) calc(+0.4px * speed-factor)` — X preserved, Y added for headwind neck drop. ✓

## Speed tiers and speedFactor
`getSpeedTier(speedMs)`: idle/walking (≤2), running (2-10), driving (10-50), airplane (50+).
`speedFactor = Math.min(1, speedMs / 15)`. At driving entry (10+ m/s): speedFactor ≈ 0.67 → nonzero wind compensation. At 15+ m/s: speedFactor = 1.0 (full effect).

## Integration API
```tsx
// Hook pattern:
const birdProps = useBirdNavigation({ heading, speed, mapBearing, mapZoom,
  navigating, upcomingTurnDirection, isHelping, skyTier,
  userLat, userLng, destinationLat, destinationLng }); // last 4 auto-compute approaching
return <SankofaBirdSvg {...birdProps} />;

// Drop-in map marker:
<NavigationBird heading={gps.heading} speed={gps.speed}
  mapBearing={map.getBearing()} mapZoom={map.getZoom()}
  navigating={route.isActive} upcomingTurnDirection={route.nextTurn}
  userLat={lat} userLng={lng} destinationLat={dLat} destinationLng={dLng} />

// Step-bearing → named turn:
computeUpcomingTurn(step.bearing_before, step.bearing_after) // → "left"|"right"|null
```

## Phase summary
- P1–P9: Flight physics, LOD, banking, landing, feather details.
- P10: Night-mode plumage.
- P11: Gap closures F1–F14.
- P12/P13: 8-direction gaze system.
- P14: data-turning, E7 boost, wing sweep, body CoM, tail rudder, perched weight-shift.
- P15: P12.13/P14.5 bug fixes, idle scan JS, gaze neck arc P15.1, mid-zoom gaze P15.2, beak pitch P15.3, eye shimmer P15.4, wing micro-lift P15.5.
- P16: useBirdNavigation + NavigationBird, wingbeat ±12% jitter, P16.1 curiosity head tilt, P16.2 anticipatory-only egg pre-swing, P16.3 WAIR flutter, P16.4 perf hardening, P16.5 navLod=2 suppression, P16.6 wind compensation.
- Bug fixes (committed post-P16): NavigationBird React import, P16.1 helping guard, P16.5 dead class names, SankofaBird.tsx shim, P16.2 analog-pendulum conflict.

## Egg pendulum system — two layers, no conflict
1. **Analog pendulum** (lines 7723-7743): `rotate: calc(var(--bank-angle)*-0.18)` at (0,3,0). Fires during committed flight bank and returns to 0deg when not-flying. Always active.
2. **P16.2 anticipatory** (lines 9953-9965): `rotate: 2.0deg` at (0,4,0). Fires ONLY when `data-turning="none"` AND `data-upcoming-turn="left/right"`. Higher specificity overrides the 0-valued analog result when bankDeg=0. Once bank commits (bankDeg≥8 → data-turning fires → data-upcoming-turn cleared to "none"), analog pendulum resumes naturally. No source-order or specificity conflict.

## P16.1 curiosity head tilt — helping guard mandatory
All 8 P16.1 rules include `:not([data-helping="true"])`. Without it, P16.1 at (0,5,0+) silently clobbers E2's helping-crane head translate at (0,3,0). This guard must never be removed.

## navLod timer — verified no leak
`setInterval(60_000)` inside `useEffect([navigating])`. `clearInterval(id)` in cleanup. `navStartRef.current = null; setNavLod(0)` immediately when `navigating` becomes false. No leak.

## Verified-real SVG class names for P16.5 navLod suppression
- Wings: `sankofa-feather-ls1/ls2/ls3/rs1/rs2/rs3` (lines 1063-1076), `sankofa-wing-scap-l1/l2/r1/r2` (lines 1143-1152), `sankofa-bird-wing-left/right-highlight`
- Body: `sankofa-glow-layer`, `sankofa-wing-joint`, `sankofa-beak-glint`, `sankofa-wing-covert-band`, `sankofa-crown-feather`, `sankofa-egg-thermal-inner/mid`, `sankofa-feather-lc1/rc1`
- DO NOT USE: `sankofa-bird-body-shimmer`, `sankofa-bird-body-highlight` — these don't exist in SVG markup.

## Device compatibility
| Platform | Animation level |
|---|---|
| iOS 14.1+, Safari | Full — all @supports rotate/translate/scale active |
| iOS 12–14 | CSS animations + transform shorthand (individual props fall back) |
| iOS < 12 | Static SVG silhouette |
| Android Chrome 85+ | Full |
| Android Chrome < 85 | Same as iOS 12–14 |
| Battery < 20% (auto) | Battery-saver: teal silhouette + core motion |
| 30+ min session | navLod=2: GPU-heavy effects fade out gracefully |
