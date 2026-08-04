---
name: SankofaBird heading rotation — inner <g> pattern
description: Why the full-360° heading rotation must live on an inner SVG <g>, not the <svg> element itself.
---

## Rule
The `transform: rotate(Xdeg)` heading rotation **must** be on `.sankofa-bird-heading-wrapper` (an inner `<g>`) inside the SVG, NOT on the `<svg>` element that carries `.sankofa-bird-body`.

## Why
CSS `animation` has higher cascade priority than `style` (inline) for the same property. The `.sankofa-bird-body` SVG element carries always-on CSS animations (`sankofa-float`, `sankofa-glide`, `sankofa-hover-body`, etc.) that continuously set `transform: translateY(...)`. Any inline `transform: rotate()` placed on the SVG element is silently overridden every animation frame — heading rotation disappears completely during flight.

The inner `<g>` has no CSS animations, so its inline `style={{ transform: "rotate(Xdeg)" }}` wins cleanly.

## How to apply
- `<svg>` element: no `transform` in inline style. CSS in phase-14-19.ts sets `transform: none` on `.sankofa-svg-root` to keep float animations free.
- `<g className="sankofa-bird-heading-wrapper">`: inline style with `transform`, `transformOrigin: "20px 20px"`, `transformBox: "view-box"`, and the transition.
- Elements that should stay screen-aligned (Shadow, Gradients) live **outside** the `<g>` but inside the `<svg>`.
- Phase-19 quadrant posture cues (neck/tail tweaks) still work because they operate in the bird's local coordinate space (inside the rotating `<g>`).

## CSS comments: never use backticks inside template literal strings
The CSS files (phase-14-19.ts etc.) are TypeScript template literals. Backtick characters inside the template body close the string early, causing parse errors. Use single quotes in comments instead.
