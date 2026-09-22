---
name: Niakofa SankofaBird Phase 4
description: Phase 4 "Conscious Intelligence Layer" — 15 new CSS effects (16–30), 6 new SVG elements, nightMode prop, key invariants not to break.
---

# SankofaBird Phase 4 — "Conscious Intelligence Layer" (July 18 2026)

## What was added

### New SankofaBirdProps
- `nightMode?: boolean` — ambient blue-teal shift at dusk (CSS effect #27). **No caller wires it yet** — Task #3 covers connecting it to time-of-day signal.

### SVG element additions (6 new)
All are `opacity={0}` baseline; CSS drives visibility:
- `sankofa-beak-glint` — cx=2.4, cy=14.15, r=0.18; beak moisture specular
- `sankofa-egg-thermal-inner` — cx=3.4, cy=15.6, r=0.60; inside egg counter-rotation `<g>`
- `sankofa-egg-thermal-mid` — cx=3.4, cy=15.6, r=0.98; inside same egg `<g>`
- `sankofa-walk-dust-4` — cx=14.0, cy=35.0; left lateral step dust
- `sankofa-walk-dust-5` — cx=26.0, cy=35.0; right lateral step dust
- `sankofa-wing-beat-ring` — cx=20, cy=27; downstroke air pressure ring
- `sankofa-speed-streak-1/2/3` — `<line>` elements at y=14/18/22; airplane blur
- `sankofa-notification-ring` — cx=20, cy=20; body-level broadcast ring

### SVG class / attribute changes
- `sankofa-svg-root` class added to `<svg>` element — targets hop (effect #21) and turbulence (effect #17), **isolated from the bank-rotate transform on the parent div**
- `data-night-mode={nightMode ? "true" : "false"}` on rig div

### Phase 4 CSS effects (16–30)
| # | Name | Trigger |
|---|------|---------|
| 16 | Walk-dust lateral puff | `data-speed="walking"` + `data-flying="false"` |
| 17 | Hover turbulence shudder | `data-approaching="true"` + `data-flying="true"` on `.sankofa-svg-root` |
| 18 | Wing-beat air pressure ring | `data-flying="true"` high/street zoom |
| 19 | Crown heading-aware iridescence | `data-zoom="street"` always |
| 20 | Celebrating wing-spread triumph | `data-celebrating="true"` cubic-bezier overshoot |
| 21 | Accepted 3-hop bounce | `data-accepted="true"` on `.sankofa-svg-root` pivot cy=32 |
| 22 | Asymmetric tail banking spread | `data-flying="true"` street zoom CSS calc() |
| 23 | Approach feather ruffle (wind) | `data-approaching="true"` 11 feathers 60ms stagger |
| 24 | Airplane speed-streak blur | `data-speed="airplane"` low/mid zoom only |
| 25 | Egg thermal depth layers | always on `.sankofa-egg-thermal-inner/mid` |
| 26 | Beak moisture glint | `data-zoom="street"` 2.8s, 1.1s delay |
| 27 | Night-mode ambient color shift | `data-night-mode="true"` 1.8s transition |
| 28 | Donated wing-tip sparkle trail | `data-donated="true"` + `data-flying="true"` |
| 29 | Iris dilation on accepted | `data-accepted="true"` on `.sankofa-bird-iris` |
| 30 | Notification arrival ring pulse | `data-notification="true"` |

## Key invariants — do NOT break

1. **`.sankofa-svg-root` targets the SVG element, not the rig div** — keeps hop/turbulence isolated from bank-rotate on `.sankofa-bird-rig`
2. **Reduced-motion guard uses `html:not([data-bird-anim="enabled"])` nesting** — consistent with Phase 3; user accessibility override (written by `useAnimationPreference`) must always win
3. **`isVisuallyGliding` (>10 m/s) drives `data-gliding`** — not `isGliding` (>50 m/s); Phase 3 physics separation, do not revert
4. **`nightMode` defaults to `false`** — never auto-detect in the component; caller drives it

## Guards
- Battery-saver guard: hides wing-beat-ring, speed-streaks, walk-dust-4/5; disables animations on thermal/notification/beak-glint/turbulence/hop/triumph
- Reduced-motion guard: all 15 effects wrapped in `html:not([data-bird-anim="enabled"]) { ... }` inside `@media (prefers-reduced-motion: reduce)`

## File stats
- `artifacts/pay-it-forward/src/components/SankofaBirdSvg.tsx` — 6256 lines after Phase 4
