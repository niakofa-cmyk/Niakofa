---
name: Niakofa SankofaBird gaze system (Phase 12)
description: Real-time 2-axis gaze — neck lateral flex (independent element), head pitch wrapper <g>, look-dir 9-state data attr, pupil/iris/crown CSS overrides.
---

## Rule
The gaze system is composed of three independent layers that must stay in sync:

1. **Neck (extracted SVG element)** — `<path class="sankofa-bird-neck">` lives OUTSIDE `sankofa-bird-head`. Transform-origin `18px 16px` (body end). CSS `rotate(headLeadDeg × 0.35)` during flight, `±8°` on upcoming-turn signals.

2. **Head pitch wrapper** — `<g class="sankofa-bird-head-pitch">` wraps `sankofa-bird-head`. React sets `transform: translateY(N px)` where `N = gazePitchSvgUnits × (size/40)` — this converts SVG viewBox units to CSS px correctly. Transition `0.5s ease-out`.

3. **data-look-dir** — nine states: `forward | left | right | up | down | left-up | right-up | left-down | right-down`. Computed by `computeLookDir()` from `headLeadDeg + upcomingTurnDirection + gazePitchSvgUnits`. CSS targets it for crown, pupil, iris.

## Math functions (sankofa-bird-math.ts)
- `computeGazePitchSvgUnits({ approaching, landingPhase, isHelping, isMoving })` → SVG units (40×40 coord space). Values: hover=−1.8, slowflap=−1.2, perch=−0.6, approaching=−1.0, helping+moving=+0.4, takeoff=+1.0, idle=0.
- `computeLookDir(headLeadDeg, gazePitchSvgUnits, upcomingTurnDirection)` → 9-state string. Yaw threshold: upcomingTurnDirection > headLeadDeg ±3°. Pitch threshold: ±0.5 SVG units.

## SVG unit vs CSS px conversion
CSS `transform: translateY(Xpx)` on an SVG `<g>` uses CSS pixels, NOT SVG viewBox units. To move by N viewBox units: `N × (size / 40)` CSS px. The `rotate(deg)` function is dimensionless — no conversion needed.

## CSS rules (Phase 12 block at end of SankofaBirdSvg.tsx style tag)
- Neck base: `transform-box: view-box; transform-origin: 18px 16px` set via React inline style on the element.
- Neck during flight: `rotate(calc(var(--head-lead-deg) × 0.35))` + `transition: 0.4s`.
- Crown: `translateY(±0.4–0.6px) rotate(±4–5deg)` on `data-gaze-vertical="up/down"`.
- Pupil: `translate(±0.25–0.35px)` per look direction.
- Iris: `animation-play-state: paused` + hold position on lateral gaze.
- Body: `scaleX(0.96/1.04)` inside-of-turn compression on `data-upcoming-turn`.
- Battery saver suppresses pitch and neck transitions; prefers-reduced-motion guards included.

**Why:** Vertical gaze was missing entirely. Neck was inside head group so lateral flex pivoted wrong (around head center not body anchor). No data attribute for CSS state targeting. nightMode prop was missing from SankofaBirdProps entirely despite Phase-10 CSS existing (40+ rules) — the rig never emitted `data-night-mode` before this fix.

**How to apply:** Any new gaze state must update `computeGazePitchSvgUnits` (new landingPhase or flight mode), `computeLookDir` (new yaw threshold), AND CSS rules in Phase 12 block. Do not re-add neck inside sankofa-bird-head — it must stay extracted.

## nightMode wiring (all call sites confirmed)
- `nightMode?: boolean` is in `SankofaBirdProps`, `SankofaBirdSvg`, `SankofaBirdRive` (with Rive input), and flows via `{...props}` spread through `SankofaBird.tsx`
- `data-night-mode={nightMode ? "true" : "false"}` emitted on the `.sankofa-bird-rig` div
- Both `map.tsx` and `request-active.tsx` call `isNight = useTimeOfDay(lat ?? null, lng ?? null)` and pass `nightMode={isNight}` to ALL their SankofaBird instances
- SankofaBirdRive adds `nightModeInput = useStateMachineInput(rive, ..., "nightMode")` and syncs it

## Dive physics (all 3 math functions fully specced)
- `computeFlapPeriodMs("dive")` = 320ms (rapid hard-braking strokes, between takeoff 250ms and slowflap 1000ms)
- `computeLeanDeg("dive")` = 18° (more than cruise max 15°; nose-down to shed altitude)
- `computeGazePitchSvgUnits({landingPhase:"dive"})` = -1.4 SVG units (sharp forward pitch)
- CSS: `[data-landing="dive"]` block at SankofaBirdSvg.tsx ~2525 animates body/wing/tail with hard-coded keyframes; `--lean-deg` set inline at rig level flows into these

## Neck ruffle pivot
- `.sankofa-bird-neck` ruffle notification CSS was using `transform-origin: 16px 18px` (transposed) — fixed to `18px 16px` (body-end, same as base rule and Phase-12 inline style)

## LandingDemo label timing
- Dive is 600ms, then slowflap 800ms, hover 1200ms, perch 800ms, idle. LandingDemo now labels each phase correctly with a DIVE badge during the 600ms window.
