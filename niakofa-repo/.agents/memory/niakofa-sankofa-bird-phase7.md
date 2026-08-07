---
name: Niakofa SankofaBird Phase 7
description: 7 biomechanical enhancements added July 18 2026 in SankofaBirdSvg.tsx; CSS individual transform rules and their mutual-exclusivity constraints.
---

# SankofaBird Phase 7 — Biomechanical Enhancements (July 18 2026)

All 7 effects appended after the E7 block at the end of the `<style>` template literal in `SankofaBirdSvg.tsx`.

## Effects

| ID | Effect | Selector gate | CSS property |
|----|--------|---------------|-------------|
| P7.1 | Egg pendulum | `[data-flying="true"] .sankofa-bird-egg` | `rotate: bank * -0.18` (0.75s lag) |
| P7.2 | Head stabilization | `[data-flying="true"][data-zoom="high/street"][data-upcoming-turn="none"] .sankofa-bird-head` | `animation: sankofa-head-steady` (translate:) |
| P7.3 | Curiosity tilt | `[data-zoom="high/street"][data-landing="idle"][data-flying="false"]:not([data-helping="true"]) .sankofa-bird-head` | `animation: sankofa-curiosity-tilt` (transform:) |
| P7.4 | Wingbeat variability | `.sankofa-feather-l2/r2/l4/r4` at high+street zoom | `animation-duration: flap * 0.93–1.07 !important` |
| P7.5 | Battery-saver crossfade | `[data-battery-saver="true"]` | `animation: sankofa-lod3-enter 0.65s` |
| P7.6 | Mid-zoom neck arc | `[data-zoom="mid"][data-flying="true"] .sankofa-bird-neck` | `rotate: bank * 0.18` (stronger than high-zoom 0.14) |
| P7.7 | Wing-highlight transition | flying high+street `.sankofa-bird-wing-*-highlight` | `transition: opacity 0.35s, filter 0.35s` |

## Mutual-exclusivity rules

- **P7.1 egg pendulum** suppressed by `data-celebrating="true"` and `data-donated="true"` (higher-specificity rules override).
- **P7.2 head steady** gated to `data-upcoming-turn="none"` — turn-glance animations (upcoming-turn rules) take priority over the anti-bob animation.
- **P7.3 curiosity tilt** mutually exclusive with `data-flying="true"` (perch-only state) and `data-helping="true"` (E2 forward-crane takes precedence via `:not([data-helping])` selector).
- **P7.5 battery-saver fade** is a CSS animation on the rig itself — fires once when attribute is first set; does NOT re-fire on React re-renders unless the element is unmounted+remounted.

## CSS property composition

All P7 rules use `rotate:` or `translate:` (CSS individual transform properties) where possible so they compose with existing `transform:` rules:

- `rotate:` (P7.1, P7.2, P7.6) ← stacks on top of `transform:` without clobbering glide pitch or helping crane
- `translate:` inside keyframes (P7.2 head-steady) ← composes with `rotate:` from E7 aerodynamic turn
- `transform:` (P7.3 curiosity tilt) ← safe because curiosity only fires when `data-flying="false"` (E7 only fires when `data-flying="true"`)

**Why:** CSS individual transform properties (`rotate:`, `translate:`, `scale:`) always compose with `transform:` on the same element; they are applied in order `translate → rotate → scale → transform`. This is why all Phase 6-7 aerodynamic rules use `rotate:` inside `@supports (rotate: 0deg)` guards.

## bird-test.tsx demo sections

Two new sections added (before the Legend):
- **AerodynamicsDemo** — three side-by-side cards at zoom 12/15/17 with live heading oscillation driving real banking; shows E7+P7.6 composing correctly at each LOD
- **Phase7Demo** — six cards covering P7.1-P7.6; P7.3 curiosity tilt requires waiting 3-8s to observe at idle

## Git state

Committed as: `feat(bird): Phase 7 biomechanical enhancements (P7.1-P7.7)`  
Pushed to `https://github.com/niakofa-cmyk/Niakofa` on `main`.
