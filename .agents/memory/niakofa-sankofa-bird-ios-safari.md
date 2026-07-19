---
name: Niakofa SankofaBird iOS Safari compatibility
description: CSS fixes required for the SankofaBird SVG animation to render correctly on iOS Safari / WebKit.
---

# SankofaBird iOS Safari Compatibility

## Rules

**1. SVG overflow must be explicit at every level**
- The SVG element needs both `overflow="visible"` attribute AND `style={{ overflow: "visible" }}` — WebKit respects one or the other depending on version.
- The outer wrapper div and `.sankofa-bird-rig` CSS rule also need `overflow: visible` — any intermediate container with default `overflow: hidden` will clip wings/tail that extend past the 40×40 viewBox.

**Why:** iOS Safari clips SVG content outside the viewBox by default. Wings, feather tips, and the tail all extend beyond 0 0 40 40.

**2. Never use `transform-box: fill-box` on SVG child elements**
- `fill-box` breaks on Safari < 16.4: the browser uses the SVG viewport origin instead of the element's own bounding box as the transform origin.
- Fix: use `transform-box: view-box` with explicit `transform-origin: <cx>px <cy>px` (SVG user-space coordinates).
- Affected elements and their coordinates:
  - Iris ring (cx=7.1, cy=12.2): `transformOrigin: "7.1px 12.2px"`
  - Pupil (cx=7.1, cy=12.2): same
  - Catchlight (cx=7.6, cy=11.85): `transformOrigin: "7.6px 11.85px"`
  - Chest ellipse (cx=20, cy=22): CSS `transform-origin: 20px 22px`
- `transform-box: view-box` with px coordinates works on ALL Safari versions.

**Why:** Safari < 16.4 mis-implements fill-box on SVG child elements. iOS 16.4 launched March 2023 — significant user share still on iOS 15.x.

**3. Register CSS custom properties with `@property` before using them in `@keyframes`**
- Without `@property`, browsers cannot interpolate `calc(var(--angle-var))` inside keyframes — the type is unknown.
- Register all angle vars as `syntax: '<angle>'`, time vars as `syntax: '<time>'`, number vars as `syntax: '<number>'`.
- Full list registered in SankofaBirdSvg.tsx: `--lean-deg`, `--tail-bend`, `--left-wing-extra`, `--right-wing-extra`, `--head-lead-deg`, `--heading-deg` (all `<angle>`); `--flap-period` (`<time>`); `--speed-factor` (`<number>`).
- `@property` is supported in Safari 15.4+ (March 2022). On older Safari, `initial-value` is used — bird still renders and flaps, just without lean/bank offset.

**Why:** Safari < 15.4 silently drops `calc(var(--angle))` interpolation in keyframes. The bird would animate with 0deg offsets instead of the real lean/bank values.

**4. `hue-rotate()` filters on nested SVG elements may be ignored in older WebKit**
- Iridescence (`sankofa-iridescent` keyframe, `hue-rotate(calc(var(--heading-deg) * 0.25))`) may not render on Safari < 15.
- This is visual-only degradation — the bird still renders with its default teal color. Not worth a workaround.

## How to apply
When adding new animated SVG child elements to SankofaBirdSvg.tsx:
- If it needs to transform around its own center: use `transform-box: view-box` + explicit `cx/cy px` coordinates, never `fill-box`.
- If it uses a new CSS custom property in an animation: add a `@property` declaration at the top of the style block.
- If it extends visually outside the 40×40 viewBox: no extra work needed — overflow is already `visible` at all levels.
