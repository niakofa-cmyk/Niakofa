---
name: Niakofa SankofaBird full phase audit — July 2026
description: Complete inventory of all SankofaBird phases, confirmed bugs found and fixed, and what was verified correct. Use this before touching any SankofaBirdSvg animation work.
---

# SankofaBird Full Phase Audit (July 19, 2026)

## Current Build Phase: PHASE 12

File: `artifacts/pay-it-forward/src/components/SankofaBirdSvg.tsx` — 9136 lines
Math: `artifacts/pay-it-forward/src/lib/sankofa-bird-math.ts` — 322 lines
Test harness: `artifacts/pay-it-forward/src/pages/bird-test.tsx` — 2188 lines

## Phase Inventory

| Phase | Title | Start Line | Status |
|-------|-------|-----------|--------|
| Phase 1 | Base animations (wing flap, banking, glide, tail, perch, landing) | ~1800 | ✓ Complete |
| Phase 2 | Final Detail Pass — neck chain S-wave, covert band, crown tip speculars, scap breathing | ~5043 | ✓ Complete |
| Phase 3 | Beyond-Rive Enhancements — isVisuallyGliding, differential iridescence, speed effects | ~5280 | ✓ Complete |
| Phase 4 | Conscious Intelligence Layer — nightMode, sky-tier, egg thermal, walk-dust, speed streaks | ~5909 | ✓ Complete |
| Phase 5 | Micro-Physics & Bilateral Asymmetry — 3% period offset per side, membrane flex | ~6666 | ✓ Complete |
| Phase 6 | Animation Physics — IntersectionObserver pause, pupil dilation, navLod throttle | ~6963 | ✓ Complete |
| Phase 1-5 Hardening (E1-E6) | Crown sway tiers, zoom crown glow, helping crane, trail gold tint | ~7304 | ✓ Complete |
| Phase 7 | Biomechanical Enhancements — egg pendulum, head stabilization, curiosity tilt | ~7603 | ✓ Complete |
| Phase 8 | Full-Body Aerodynamic Kinetics — spine-twist cascade, tail banking, body dart | ~7805 | ✓ Complete (bug fixed) |
| Phase 9 | Biomechanical Realism — wing asymmetry +18ms, feather lag cascade, shadow, tail spring | ~8118 | ✓ Complete |
| Phase 10 | Night-Mode Plumage — pupil shimmer, moonlit rim, nocturnal breathing, bio-glow | ~8377 | ✓ Complete |
| Phase 11 (F1-F14) | Finalization — crown sway restore, wingtip flex, helping crane compose, @property audit | ~8552 | ✓ Complete |
| Phase 12 (G1-G10) | Gaze Saccades — 8-direction iris/head/neck/body, saccade cycling, gap closure | ~8728 | ✓ Complete (bug fixed) |
| iOS/Android hardening | GPU compositing, stacking contexts, @supports guards (July 19 2026) | ~8970 | ✓ Complete |

## Confirmed Bugs Found and Fixed (July 19, 2026)

### Bug 1 — G7: Invalid CSS keyframe `sankofa-feather-compress`
**Location:** Line ~8910
**What broke:** `@keyframes sankofa-feather-compress { 0%,100%{scaleX:1} 50%{scaleX:0.82} }`
`scaleX:value` is NOT valid CSS. Browsers silently ignored the entire block. Pre-bank feather compression (Phase 12 G7) produced zero visual change since written.
**Fix:** Changed to `transform: scaleX(1.0)` / `transform: scaleX(0.82)`. Added `transform-box: view-box; transform-origin: 50% 50%` to the selector rules.

### Bug 2 — Phase 12: Neck missing `downleft`/`downright` gaze rules
**Location:** Neck S-curve coupling block in Phase 12
**What broke:** Neck had rules for 6 of 8 gaze directions (left/right/up/down/upleft/upright). `downleft` and `downright` were missing. Bird neck froze at last rotate value instead of following the head on diagonal-down gazes.
**Fix:** Added `rotate: 2deg` for downleft and `rotate: -2deg` for downright, matching the upward-diagonal convention.

### Bug 3 — P8.3: Wing-joint covert lift missing reactive visual rules
**Location:** Phase 8, P8.3 block
**What broke:** The P8.3 comment described banking-reactive wing-joint brightening but the implementation only set `transition: opacity 0.40s ease-out, filter 0.40s ease-out`. No `filter: brightness(calc(...))` rules existed. Wing joints were always static regardless of banking.
**Fix:** Added reactive `filter: brightness(calc(clamp(..., 1.0 + var(--bank-angle, 0deg) / 25deg * 0.38, ...)))` rules for `.sankofa-wing-joint-right` (brightens during right bank) and `.sankofa-wing-joint-left` (dims during right bank), with battery-saver and not-flying reset guards.

## Data-* Attributes (all 20 confirmed wired)
data-flying, data-gliding, data-landing, data-celebrating, data-notification, data-accepted, data-donated, data-upcoming-turn, data-zoom, data-nearby-user, data-speed, data-approaching, data-helping, data-battery-saver, data-night-mode, data-sky-tier, data-activity, data-nav-lod, data-off-screen, data-gaze

## CSS Stats
- 201 `@keyframes` blocks (sankofa-* prefix)
- 426 `animation:` declarations
- 9136 total lines

## What Was Confirmed Correct (do NOT re-audit these)
- All @property declarations have syntax + inherits + initial-value ✓
- activityTier IS wired as `data-activity={activityTier}` at line 623 ✓
- sankofa-tail-headwind-fan keyframe IS referenced by a CSS rule ✓
- sankofa-beak-chirp vs sankofa-beak-chirp-open are intentionally different ✓
- All 8 gaze directions have iris/catchlight rules ✓
- All 8 gaze directions have head-tilt rules ✓ (downleft/downright now also have neck rules after Bug 2 fix)
- Battery Status API fallback on iOS correctly returns `externalProp` ✓
- computeGazeVector saccade phase cycling is correct (setTimeout-based, pauses during nav) ✓
- bird-test.tsx exercises all SankofaBirdProps — no unexercised props found ✓

## How to Apply
- Always check this file before writing any new SankofaBird CSS
- `transform-box: view-box` (not fill-box) is the correct pattern for SVG elements in this file
- CSS vars used in keyframes need @property + var(--prop, fallback) at every point of use
- No backticks in CSS comments inside JSX template literals — Babel crashes on them
- @supports (rotate: 0deg) gates individual CSS transform properties for Safari 14.1+
- Specificity rule: 2 data-attribute selectors override 1 data-attribute selector; use `!important` only when specificity alone is insufficient
