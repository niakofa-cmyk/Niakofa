---
name: Sankofa Bird project
description: Architecture, phase history, and key decisions for the Sankofa Bird SVG animation in artifacts/pay-it-forward/
---

## Project location
`artifacts/pay-it-forward/src/` — source only, no package.json or node_modules in the workspace.
Full monorepo lives on GitHub: `niakofa-cmyk/Niakofa`. Push with `gitPush({})`.

## Key files (5 total)
- `src/components/SankofaBirdSvg.tsx` (~10,125 lines) — monolithic SVG bird: React state, inline CSS-in-JS `<style>` block.
- `src/lib/sankofa-bird-math.ts` (329 lines) — pure math functions (computeGazeVector, computeBankAngle, etc.).
- `src/pages/bird-test.tsx` (~2,197 lines) — visual regression harness, one demo per phase.
- `src/lib/__tests__/sankofa-bird.test.ts` (698 lines) — unit tests for math functions.
- **`src/lib/useBirdNavigation.ts`** (272 lines) — NEW: live GPS/nav → SankofaBirdProps hook.
- **`src/components/NavigationBird.tsx`** (111 lines) — NEW: drop-in wrapper component.

## Architecture: Props → data-attributes → CSS pipeline
React computes CSS vars (--bank-angle, --flap-period, --gaze-x/y, --turn-intensity, etc.) and data attributes (data-flying, data-gaze, data-turning, data-upcoming-turn, data-speed, data-zoom, data-nav-lod, etc.) on `.sankofa-bird-rig`. All CSS gating hangs off these.

## Critical CSS rules
- Individual transform properties (rotate:, translate:, scale:) compose ADDITIVELY with transform: shorthand.
- skewX: does NOT exist as a standalone property — only as transform: skewX(). `@supports(skewX:0deg)` always FALSE.
- @property for --blink-period, --gaze-x/y etc NOT supported before iOS 16.4 — graceful degradation only.

## Integration API (new — Phase 16)
```tsx
// Simplest: spread hook result onto SankofaBirdSvg
const birdProps = useBirdNavigation({ heading, speed, mapBearing, mapZoom,
  navigating, upcomingTurnDirection, isHelping, skyTier });
return <SankofaBirdSvg {...birdProps} />;

// Or use drop-in wrapper (recommended):
<NavigationBird heading={gps.heading} speed={gps.speed}
  mapBearing={map.getBearing()} mapZoom={map.getZoom()}
  navigating={route.isActive} upcomingTurnDirection={route.nextTurn}
  userLat={lat} userLng={lng} destinationLat={dLat} destinationLng={dLng} />

// For SDKs with step bearings instead of named turns:
computeUpcomingTurn(currentStep.bearing_before, nextStep.bearing_after)
```
Auto battery-saver: Battery Status API (< 20% + not charging) + Page Visibility (backgrounded).
Auto approaching: haversine distance from lat/lng within approachRadiusM (default 50m).

## Phase summary
- P1-P9: Flight physics, LOD, banking, landing, feather details.
- P10: Night-mode plumage.
- P11: Finalization gap closures (F1-F14).
- P12/P13: 8-direction gaze system. Commit 5cc2c163.
- P14 (commit 1357ac4b): data-turning attribute, E7 coefficient boost, wing sweep.
- P15 (commit efc173b1): Bug fix P12.13 (@supports skewX dead code), P14.5 fix (neck duplicate + helping guard), idle scan JS, gaze neck arc P15.1, mid-zoom gaze P15.2, beak pitch P15.3, eye shimmer P15.4, wing micro-lift P15.5.
- **P16 (commit 83c16247)**: Live nav wiring + biomechanics. Details below.

## Phase 16 changes (July 2026)
**New files:** useBirdNavigation.ts, NavigationBird.tsx.
**Wingbeat variability:** flapJitter state (±12%) cycles every 3-8 flap periods via setTimeout. effectiveFlapMs feeds --flap-period CSS var. Battery-saver suppresses (jitter=1.0).
**P16.1 Curiosity head tilt:** diagonal idle-scan gaze adds Z-axis tilt via transform:rotate() composing with P12.2 rotate: individual prop. up-left → +4deg, up-right → -4deg, down-* → ±2deg.
**P16.2 Egg pendulum:** data-turning → egg rotate ±3.5deg counter-turn with spring overshoot bezier. Anticipatory: upcoming-turn pre-swings 2deg. Returns with spring.
**P16.3 WAIR flutter:** data-speed=walking/running + not-flying → sankofa-wair-flutter keyframe (1.8s). Right wing +18ms delay matching flight asymmetry.
**P16.4 Perf hardening:** CSS containment @supports guard. will-change:transform gated to data-flying=true ONLY. will-change:auto when grounded. translateZ(0) on low-zoom.
**P16.5 NavLod=2:** animation-play-state:paused + opacity:0 on glow/shimmer/scap/crown. Filter:none on highlights. 1.5s graceful fade.
**P16.6 Wind-comp:** driving speed → neck Y translate (neck lowers). Tail outer feathers rotate ±speed-factor (tail opens for stability).

## Device compatibility
- iOS 14.1+: full animation (all @supports rotate/translate/scale blocks)
- iOS 12-14: CSS animations + transform shorthand (individual properties fall back)
- iOS < 12: static SVG silhouette
- Android Chrome 85+: full animation; < 85: same as iOS 12-14

## LOD tiers / navLod timer
- Zoom: low (<10), mid (10-13), high (14-16), street (≥17).
- navLod: 0 (0-10 min), 1 (10-30 min), 2 (30 min+). Auto-escalates via internal timer. Override with navLodOverride prop.
- Banking decay: bankDeg → 0 after 700ms setTimeout on heading change.
