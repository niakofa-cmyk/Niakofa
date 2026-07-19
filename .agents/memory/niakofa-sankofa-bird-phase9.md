---
name: Niakofa SankofaBird Phase 9
description: Phase 9 biomechanical realism enhancements (July 2026) — wing asymmetry, feather cascade, shadow dynamics, night eye, tail spring, wind fan, anticipatory look, community salute. Also covers the battery-saver display:none fix.
---

# SankofaBird Phase 9 — Biomechanical Realism

**Why:** Vision documents specified 24 biomechanical/behavioral improvements. Phase 9 implements the 8 most impactful as pure CSS, zero JS.

## Battery-saver fix (critical)
All `[data-battery-saver="true"]` elements previously used `display: none !important` — impossible to CSS-transition. Replaced with `opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important;` across ALL instances. Now entry (via P7.5 sankofa-lod3-enter animation) AND exit both fade smoothly.

**How to apply:** If you ever add a new battery-saver hide rule, use opacity:0 not display:none.

## Phase 9 effects

| Effect | CSS technique | Key value |
|--------|--------------|-----------|
| P9.1 Wing asymmetry | animation-delay | right wing +18ms, right-feathers +22ms, right-highlight +14ms |
| P9.2 Feather lag cascade | animation-delay per tier | primary 0ms → covert 90ms → scap 115ms → body 140-158ms → tail 172ms |
| P9.3 Shadow dynamics | scale: X/Y individual prop | walking 1.08/0.95 → airplane 1.68/0.64; landing widens 1.24/1.10 |
| P9.4 Night eye reflectiveness | filter + animation-duration | brightness(1.55) hue-rotate(18deg); blink 1.4× slower |
| P9.5 Tail momentum spring | transition cubic-bezier | cubic-bezier(0.34, 1.56, 0.64, 1.0) on rotate: |
| P9.6 Wind tail-fan | @keyframes sankofa-tail-headwind-fan | scaleX(1.20) scaleY(0.84) at airplane speed |
| P9.7 Anticipatory look | rotate: on head/neck | data-upcoming-turn=left/right → head ±7deg, neck ±4deg |
| P9.8 Community wing salute | @keyframes sankofa-wing-salute | data-nearby-user → left wing -8.5deg × 2 iterations |

## Guards
All Phase 9 effects: `[data-battery-saver="true"]` → resets, `@media(prefers-reduced-motion:reduce)` → no animations, `[data-zoom="low"]` → suppressed.

## @supports usage
- P9.3 shadow dynamics: `@supports (scale: 1)`
- P9.5 tail spring, P9.7 anticipatory: `@supports (rotate: 0deg)`

## data-upcoming-turn wiring
Already wired at SankofaBirdSvg.tsx line 591 from `upcomingTurnDirection` prop. bird-test.tsx has both UpcomingTurnDemo (original) and AnticipationDemo (P9 addition, cycle-based).

## File sizes
SankofaBirdSvg.tsx is now ~8337 lines. Babel notes it exceeds 500KB (style deoptimization) — this is informational only, does not break anything.
