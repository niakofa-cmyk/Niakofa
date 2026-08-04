---
name: Niakofa SankofaBird full phase audit — July 2026 (updated)
description: Complete inventory of all SankofaBird phases, confirmed bugs found and fixed, and what was verified correct. Use this before touching any SankofaBirdSvg animation work.
---

# SankofaBird Full Phase Audit (July 19, 2026 — updated)

## Current Build Phase: PHASE 14

File: `artifacts/pay-it-forward/src/components/SankofaBirdSvg.tsx` — 9611 lines
Math: `artifacts/pay-it-forward/src/lib/sankofa-bird-math.ts`
Test harness: `artifacts/pay-it-forward/src/pages/bird-test.tsx`

## Phase Inventory

| Phase | Title | Status |
|-------|-------|--------|
| Phase 1 | Base animations (wing flap, banking, glide, tail, perch, landing) | ✓ Complete |
| Phase 2 | Final Detail Pass — neck chain S-wave, covert band, crown tip speculars, scap breathing | ✓ Complete |
| Phase 3 | Beyond-Rive Enhancements — isVisuallyGliding, differential iridescence, speed effects | ✓ Complete |
| Phase 4 | Conscious Intelligence Layer — nightMode, sky-tier, egg thermal, walk-dust, speed streaks | ✓ Complete |
| Phase 5 | Micro-Physics & Bilateral Asymmetry — 3% period offset per side, membrane flex | ✓ Complete |
| Phase 6 | Animation Physics — IntersectionObserver pause, pupil dilation, navLod throttle | ✓ Complete |
| Phase 1-5 Hardening (E1-E6) | Crown sway tiers, zoom crown glow, helping crane, trail gold tint | ✓ Complete |
| Phase 7 | Biomechanical Enhancements — egg pendulum, head stabilization, curiosity tilt | ✓ Complete |
| Phase 8 | Full-Body Aerodynamic Kinetics — spine-twist cascade, tail banking, body dart | ✓ Complete (bug fixed) |
| Phase 9 | Biomechanical Realism — wing asymmetry +18ms, feather lag cascade, shadow, tail spring | ✓ Complete |
| Phase 10 | Night-Mode Plumage — pupil shimmer, moonlit rim, nocturnal breathing, bio-glow | ✓ Complete |
| Phase 11 (F1-F14) | Finalization — crown sway restore, wingtip flex, helping crane compose, @property audit | ✓ Complete |
| Phase 12 (G1-G10) | Gaze Saccades — 8-direction iris/head/neck/body, saccade cycling, gap closure | ✓ Complete (3 bugs fixed) |
| Phase 13 | Full Authentic Aerodynamics — figure-8 stroke, WAIR, soaring, mating, hover-wrist, knee joints, murmuration, gaze chain, feather slot | ✓ Complete |
| Phase 14 | 8-direction saccade (all compass points, no null slots), bank-responsive gaze, activity controls, solar sim, regression panel | ✓ Complete (189 tests pass on phase14 branch) |
| iOS/Android hardening | GPU compositing, stacking contexts, @supports guards (July 19 2026) | ✓ Complete |

## Confirmed Bugs Found and Fixed (Phase 12, July 19 2026)

- **G7:** Invalid CSS `scaleX:value` in keyframe → fixed to `transform: scaleX()`
- **Phase 12 neck:** Missing downleft/downright gaze rules → added `rotate: ±2deg`
- **P8.3:** Wing-joint brightening missing → added `filter: brightness(calc(...))` rules

## Key Wiring Verified (July 19 2026)

- `upcomingTurnDirection` → `computeGazeVector` → `data-gaze` (anticipatory gaze)
- `request-active.tsx` and `civic-task-nav.tsx` both wire: skyTier, nightMode, batterySaver, activityLevel, upcomingTurnDirection, approaching
- `NavigationOverlay.tsx` has `onStepAdvance?: (stepIndex: number) => void` prop — fires on step advance so parent derives upcomingTurnDirection
- Night mode auto-dims at sunset via `useSolarTier(lat, lng)` on both nav screens
- Activity level = `Math.min(1, Math.sqrt(openRequestCount / 10))`, refetched every 60s
- `useAutoBatterySaver` auto-enables on ≤15% battery or <4GB RAM
- `data-off-screen` via IntersectionObserver pauses all animations when app is backgrounded (P6.1)

## Data-* Attributes (all 20 confirmed wired)
data-flying, data-gliding, data-landing, data-celebrating, data-notification, data-accepted, data-donated, data-upcoming-turn, data-zoom, data-nearby-user, data-speed, data-approaching, data-helping, data-battery-saver, data-night-mode, data-sky-tier, data-activity, data-nav-lod, data-off-screen, data-gaze

## CSS Stats (Phase 14)
- 9611 total lines
- All @property declarations have syntax + inherits + initial-value ✓
- @supports (rotate: 0deg) gates Phase 8+ individual CSS transform properties for Safari 14.1+

## How to Apply
- `transform-box: view-box` (not fill-box) for SVG elements
- CSS vars in keyframes need @property + var(--prop, fallback)
- No backticks in CSS comments inside JSX template literals — Babel crashes
- Specificity: 2 data-attrs > 1 data-attr; use !important only when specificity insufficient
