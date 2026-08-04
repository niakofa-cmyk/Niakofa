---
name: Niakofa SankofaBird Phase 20 SME v2/v3
description: SME v2/v3 physics upgrades (exponential damping, wind blend, smooth wing, battery eye skip) + Phase 20 CSS; current build is Phase 20.
---

# SankofaBird Phase 20 — SME v2/v3 Physics Upgrades

## Current build phase
**Phase 20** — as of July 21, 2026.
CSS files: `base.ts` + `phase-3-11.ts` + `phase-12-13.ts` + `phase-14-19.ts` + `phase-20.ts` assembled in `sankofa-bird-css/index.ts`.

## SME v2/v3 upgrades applied

### FlightState.ts — new fields
- `windStrength: number` — [0..1], from wind magnitude / 2.34 (storm max)
- `windHeading: number` — radians, from atan2(windY, windX) − π/2 (north=0)
- Kept `windX`/`windY` for backward compat with P6/P13 CSS feather-ruffle rules.

### SensorEngine.ts — wind vector → windStrength/windHeading
- `windStrength = min(1, sqrt(windX²+windY²) / 2.34)`
- `windHeading = atan2(windY, windX) − π/2`

### MotionSolver.ts — 5 key changes
1. **Exponential damping** — `dampedApproach(current, target, rate, dt) = current + (target−current)×(1−exp(−rate×dt))`. Replaces `Math.min(1, dt×rate)` linear form. Frame-rate independent.
2. **Wind heading blend** — `effectiveHeading = lerpAngle(heading, windHeading, windStrength×0.3)` BEFORE kinematic chain responds. Physical crosswind drift.
3. **Smooth wing amp/freq** — `_wingAmplitude` and `_wingFreq` private accumulators approach mode targets with `dampedApproach(rate=6)`. Hover↔cruise↔fast feel fluid.
4. **Battery-saver eye skip** — eye drift computed but targeted at 0 (dampedApproach to 0) when `batterySaver`. Skip entire secondary motion matches Flutter's `!lowPowerMode`.
5. **Notification ping wing bump** — when `notificationPulse > _notificationDecay`, bumps `_wingAmplitude += 0.25` (clamped 1). One-shot transient nudge pattern from Flutter.

### useAnimationMixer.ts
- Added `--sme-wind-strength` to `SME_CSS_VARS` map.
- Written in rAF tick from `SolverOutput.windStrength`.

### Phase 20 CSS effects (phase-20.ts)
| Rule | Effect | Key var |
|------|---------|---------|
| P20.1 | Notification/celebration body glow (drop-shadow + brightness) | `--sme-notification-pulse` |
| P20.2 | SME body roll tilt on `.sankofa-bird-chest` | `--sme-body-roll-deg` |
| P20.3 | Wing covert band opacity scales with flap amplitude | `--sme-flap-amplitude` |
| P20.4 | Outer primary feather brightness ruffle during wind | `--sme-wind-strength` |
| P20.5 | Head rotation additive from solver (0.25× scale over gaze-rotate-deg) | `--sme-head-deg` |
| P20.6 | `@property` declarations for all new SME numeric CSS vars | — |
| P20.7 | Battery-saver suppression block | — |
| P20.8 | `prefers-reduced-motion` guard | — |

## Why
- Flutter `sankofa_motion_engine-2/3` packages uploaded by user; all improvements ported to TypeScript SME layer.
- Linear damping could overshoot at large dt (tab-switch spikes); exponential is unconditionally stable.
- Wind-heading blend is more physical than just nudging the chest after kinematic chain runs.

## How to apply
- When adding new solver physics: put time-integrated state in private `_` fields on MotionSolver (not React state).
- All SME CSS effects should gate on `:not([data-battery-saver="true"])` — rAF loop is bypassed in that mode so `--sme-*` vars may be stale.
- Test count after Phase 20: **307 pass** (node --import tsx/esm --test runner, NOT jest).
