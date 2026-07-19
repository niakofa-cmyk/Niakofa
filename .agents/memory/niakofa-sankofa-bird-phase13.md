---
name: SankofaBird Phase 13 — Full Authentic Aerodynamics
description: Props, CSS gating, math functions, pitfalls, and July 2026 fixes for P13 aerodynamic effects
---

# SankofaBird Phase 13 — Full Authentic Aerodynamics

## New props (SankofaBirdProps / SankofaBirdSvg.tsx)
- `wairMode?: boolean` — Wing-Assisted Incline Running; body pitched 28°, rapid wing churn, head level-locked
- `soaring?: boolean` — Albatross dynamic soaring (4.2s dive-climb cycle); also auto-activates at speedMs > 30
- `matingDisplay?: boolean` — 1.6s courtship sequence (pivot + wing fan + head bow + crown flash)

All three are passed through by the `SankofaBird.tsx` wrapper via `...props` spread.

## Data attributes set on rig div
- `data-wair="true"` when wairMode
- `data-soaring="true"` when soaring
- `data-mating="true"` when matingDisplay
- `data-aero-mode={aeroMode}` — derived from computeAeroMode(); values: "flap"|"soar"|"hover"|"wair"|"mating"|"idle"

## Math functions (sankofa-bird-math.ts)
- `computeAeroMode({ speedMs, navigating, landingPhase, wairMode?, soaring?, matingDisplay? }): AeroMode`
  — Priority: mating > wair > soar(speed>30) > hover > takeoff/slowflap(flap) > dive(soar) > idle/perch > flying(speed-based)
- `computeFigureEightAmplitude({ speedMs, isGliding, landingPhase }): { downstrokeAngle, upstrokeAngle, strokeEllipseRatio }`
- `computeLegStrideDelays(speedMs): { leftDelayMs, rightDelayMs, stridePeriodMs }`

## CSS gating summary
| Effect | Selector gate | Key keyframe |
|---|---|---|
| P13.1 figure-8 | `[data-flying][data-speed="running/driving"]:not([data-wair]):not([data-soaring])` | sankofa-figure8-left/right |
| P13.2 WAIR | `[data-wair="true"]` | sankofa-wair-body/wing/head/leg |
| P13.3 soaring | `[data-soaring="true"]` | sankofa-soar-body/wing/tail/head |
| P13.4 mating | `[data-mating="true"]` | sankofa-mating-body/wing/tail/head/crown |
| P13.5 hover-wrist | `[data-landing="hover"]` | sankofa-hover-wrist-left/right |
| P13.6 knee | `[data-flying][data-speed="walking/running"]` | sankofa-knee-bob-left/right |
| P13.7 murmur | `[data-flying][data-speed="driving"]` on feathers | sankofa-murmur-wave |
| P13.8 gaze chain | `@supports (rotate: 0deg)` + `[data-gaze="left/right"]` on wing+tail | individual rotate: property |
| P13.9 feather slot | `[data-landing="takeoff/hover"]` on .sankofa-feather-l0/l1/r0/r1 | sankofa-slot-open |
| P13.11 knee dots | `.sankofa-knee-joint` opacity by zoom tier | — |
| P13.12 knee pulse | `[data-flying][data-zoom="street"]` on .sankofa-knee-joint-left/right | sankofa-wrist-stroke-pulse |

## Critical pitfalls

### animation-delay after animation:!important is silently ignored
`animation: X !important` sets animation-delay to 0s **with** !important, overriding any subsequent
bare `animation-delay:` declaration (which has no !important). Always embed the delay in the
animation shorthand itself:
```css
/* WRONG */
animation: foo 1s ease-in-out infinite !important;
animation-delay: 200ms;   /* <-- silently ignored */

/* WRONG (subtle variant) — adds 18ms to DURATION, not as a DELAY */
animation: foo calc(1s + 18ms) ease-in-out infinite !important;

/* CORRECT */
animation: foo 1s ease-in-out 200ms infinite !important;
```
Fixed July 2026: figure8-right (running+driving), wair-wing-right, mating-wing-right all now use
proper `period ease 18ms infinite` shorthand instead of `calc(period + 18ms)` duration hack.
P13.12 wrist-stroke-pulse right knee also fixed (bare animation-delay: 18ms → embedded in shorthand).

### P13.7 murmuration: keyframe must include micro-transform
`animation:!important` replaces all animations on the element, including any existing feather
micro-oscillation from earlier phases. The `sankofa-murmur-wave` keyframe includes a small
`transform` oscillation (rotate ±0.5deg, translateY 0–0.4px) so feathers still visibly move.

### P13.8 gaze chain: @supports (rotate: 0deg) is required
The body gaze chain uses individual `rotate:` CSS property (not `transform: rotate()`).
Per codebase convention, ALL individual rotate/translate/scale properties must be wrapped in
`@supports (rotate: 0deg)` for Safari 14.1+ compat. Without it, the browser ignores the rule
silently — NOT a crash, just invisible.

### computeAeroMode: all LandingPhase values must be handled
`takeoff` and `slowflap` → "flap", `dive` → "soar", `flying` → speed-based.
Falling through to "idle" on takeoff/slowflap is wrong.

### data-aero-mode is now wired (July 2026)
computeAeroMode is imported and called in SankofaBirdSvg.tsx. Result set as data-aero-mode on rig.
Previously missing — CSS cannot use data-aero-mode gates until this attribute exists on the rig.

## Tests (bird-test.tsx)
7 demo components: FigureEightDemo, WairDemo, SoaringDemo, MatingDisplayDemo,
HoverAndKneeDemo, GazeBodyChainDemo, AerodynamicsPhase13Panel.
All wired into BirdTestPage default export under "Phase 13 — Full Authentic Aerodynamics" section.
Uses BirdCardP13 wrapper (passes wairMode/soaring/matingDisplay through to SankofaBird).

## Regression tests (sankofa-bird.test.ts — added July 2026)
80 new tests across 5 suites:
- computeGazeVector (20 tests): all 8 priority cases, saccadePhase cycle, edge cases
- nextSaccadePhase (3 tests): cycle advance, range, full-cycle identity
- computeAeroMode (14 tests): all priority cases, edge cases
- computeFigureEightAmplitude (8 tests): glide/hover/takeoff values, asymmetry invariants
- computeLegStrideDelays (8 tests): threshold, alternating gait, period floor, walking reference
Total test count: 175 (all pass).

**Why:** wairMode/soaring/matingDisplay are mutually exclusive; WAIR/soaring use speed-independent
prop overrides so they can be tested without simulating GPS speed.
