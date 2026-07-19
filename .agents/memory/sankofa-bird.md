---
name: Sankofa Bird project
description: Architecture, phase history, bugs fixed, and key decisions for the Sankofa Bird SVG animation in artifacts/pay-it-forward/
---

## Project location
`artifacts/pay-it-forward/src/` — source only. Full monorepo on GitHub: `niakofa-cmyk/Niakofa`. Push with `gitPush({})`.

## File inventory (7 files, 13 230 lines total)
| File | Lines | Role |
|---|---|---|
| `src/components/SankofaBirdSvg.tsx` | 10 143 | Monolithic SVG bird — React state + inline CSS-in-JS `<style>` block |
| `src/components/SankofaBird.tsx` | 19 | Backward-compat shim: `export { SankofaBirdSvg as SankofaBird }` |
| `src/components/NavigationBird.tsx` | 112 | Drop-in map marker — NavInput → hook → SankofaBirdSvg |
| `src/lib/useBirdNavigation.ts` | 272 | GPS/nav SDK → SankofaBirdProps; auto battery-saver; haversine approaching |
| `src/lib/sankofa-bird-math.ts` | 329 | Pure math functions |
| `src/lib/__tests__/sankofa-bird.test.ts` | — | Unit tests for math functions |
| `src/pages/bird-test.tsx` | 2 355 | Visual regression harness — ALL phases including P14/15/16 demos |

## Critical naming note
`SankofaBird` was renamed to `SankofaBirdSvg` during Phase development. `SankofaBird.tsx` is a 2-line re-export shim preserving backward compat for bird-test.tsx. Do NOT add logic to the shim.

## Architecture: Props → data-attributes → CSS pipeline
Props → React computes CSS vars (--bank-angle, --flap-period, --gaze-x/y, --turn-intensity, --speed-factor, etc.) + data-attrs (data-flying, data-gaze, data-turning, data-upcoming-turn, data-speed, data-zoom, data-nav-lod, data-battery-saver, data-helping, etc.) on `.sankofa-bird-rig`. All CSS gating hangs off these attributes.

## Critical CSS composition rules
- `rotate:` + `translate:` + `scale:` individual properties compose ADDITIVELY with `transform:` shorthand on same element. Both apply.
- `skewX:` does NOT exist as a standalone property — only `transform: skewX()`. `@supports(skewX:0deg)` is always FALSE.
- `@property` for custom properties: NOT supported before iOS 16.4 / Chrome 85. Bird degrades gracefully without it.
- When two rules set `transform:` on the same element, the HIGHER SPECIFICITY one wins (they do NOT compose).

## Integration API
```tsx
// Hook pattern (any map SDK):
const birdProps = useBirdNavigation({ heading, speed, mapBearing, mapZoom,
  navigating, upcomingTurnDirection, isHelping, skyTier,
  userLat, userLng, destinationLat, destinationLng }); // last 4 auto-compute approaching
return <SankofaBirdSvg {...birdProps} />;

// Drop-in wrapper (recommended):
<NavigationBird heading={gps.heading} speed={gps.speed}
  mapBearing={map.getBearing()} mapZoom={map.getZoom()}
  navigating={route.isActive} upcomingTurnDirection={route.nextTurn}
  userLat={lat} userLng={lng} destinationLat={dLat} destinationLng={dLng} />

// Step-bearing → named turn direction:
computeUpcomingTurn(step.bearing_before, step.bearing_after) // → "left"|"right"|null
```

## Phase summary
- P1–P9: Flight physics, LOD, banking, landing, feather details.
- P10: Night-mode plumage.
- P11: Gap closures F1–F14.
- P12/P13: 8-direction gaze system.
- P14 (`1357ac4b`): data-turning, E7 boost, wing sweep, body CoM, tail rudder, perched weight-shift.
- P15 (`efc173b1`): P12.13 bug fix (@supports skewX dead code), P14.5 bug fix (neck dart duplicate), idle scan JS, gaze neck arc P15.1, mid-zoom gaze P15.2, beak pitch P15.3, eye shimmer P15.4, wing micro-lift P15.5.
- P16 (`83c16247`): useBirdNavigation + NavigationBird, wingbeat ±12% jitter, P16.1 curiosity head tilt, P16.2 egg pendulum, P16.3 WAIR flutter, P16.4 perf hardening, P16.5 navLod=2 suppression, P16.6 wind compensation.
- Bug fixes (`e066ea6c`): P16.1 missing :not([data-helping]) guard, P16.5 dead class names, NavigationBird.tsx React import, bird-test.tsx P14/15/16 demo cards.
- Shim fix (`fa209484`): SankofaBird.tsx backward-compat re-export — fixes broken import in bird-test.tsx.

## P16.1 curiosity head tilt — important specificity note
All 8 P16.1 selectors include BOTH `:not([data-flying="true"])` AND `:not([data-helping="true"])`. The helping guard is CRITICAL: P16.1 at (0,5,0+) would otherwise clobber E2's helping-crane head transform (translateX/Y) at (0,3,0). See comment in P16.1 CSS block.

## P16.5 navLod=2 — verified class names only
Class names in P16.5 are verified against SVG markup. DO NOT add `sankofa-bird-body-shimmer` or `sankofa-bird-body-highlight` — these don't exist in the SVG. Use: sankofa-glow-layer, wing-scap-l1/l2/r1/r2, crown-feather, feather-ls1/ls2/ls3/rs1/rs2/rs3, wing-left-highlight, wing-right-highlight.

## LOD / navLod / isMoving behavior
- `isMoving = (navigating || landingPhase === "flying") && speedMs > 0.3` — navigating=false means not flying.
- navLod: 0 (0–10 min), 1 (10–30 min), 2 (30+ min). Auto-escalates via setInterval(60 000). Resets to 0 immediately when navigating=false.
- data-speed from getSpeedTier(speedMs) — fires regardless of navigating=true/false.
- WAIR flutter fires when data-speed="walking" AND not data-flying="true" (navigating=false, speed=1.4).

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
