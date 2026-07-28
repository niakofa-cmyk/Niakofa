---
name: Niakofa SankofaBird Phase 10
description: Phase 10 night-mode plumage enhancement system — 10 new CSS effects for biologically-accurate low-light rendering
---

# SankofaBird Phase 10 — Night-Mode Plumage Enhancement System

All effects gated on `[data-night-mode="true"]` (set when `effectiveSkyTier === "night"`).

## Effects (P10.1–P10.10)

- **P10.1**: Star-reflection pupil shimmer on `.sankofa-bird-eye-catchlight` — replaces default blink at high/street zoom with `sankofa-night-pupil-shimmer` (6.4s). `mix-blend-mode: screen`.
- **P10.2**: Moonlit wing-edge cool rim light on `.sankofa-bird-wing-left-highlight` — `sankofa-night-wing-rim` 9.2s. High/street zoom only.
- **P10.3**: Nocturnal slow breathing — overrides `animation-duration` on `.sankofa-bird-chest` and `.sankofa-bird-belly` to 6.8s idle / 3.4s flying (vs 3.8s/2.2s daytime).
- **P10.4**: Dark plumage texture shift — `.sankofa-body-feather` gets `filter: hue-rotate(18deg) saturate(0.62) brightness(0.72)` when not flying.
- **P10.5**: Bioluminescent teal feather glow during night flight — `sankofa-night-feather-bio` synced to `var(--flap-period)`. High/street zoom only.
- **P10.6**: Night blink rate 1.6× slower — `animation-duration: calc(var(--blink-period) * 1.6)` on iris/eyelid. Mid/low catchlight only (high/street catchlight handled by P10.1).
- **P10.7**: Shadow suppressed — `.sankofa-bird-shadow` opacity 0.08 at night (diffuse moonlight = no sharp shadow).
- **P10.8**: Crown moonlit tips — `sankofa-night-crown-moon` 11s on `.sankofa-crown-tip`. High/street zoom only.
- **P10.9**: Egg lunar pearl glow — `sankofa-night-egg-moon` 8.4s on `.sankofa-bird-egg` when not celebrating/donated.
- **P10.10**: Low-zoom silhouette sharpening — `contrast(1.50)` at zoom=low, `contrast(1.22)` at zoom=mid when night mode.

## Guards
- Battery-saver: P10.1 (catchlight), P10.2 (wing rim), P10.4/5 (feather bio), P10.8 (crown), P10.9 (egg) all suppressed.
- Reduced-motion: all P10 animations suppressed via `@media (prefers-reduced-motion: reduce)`.

## Night mode connection
- `useSolarTier(lat, lng)` → `skyTier` prop → `effectiveSkyTier` → `data-sky-tier` + `data-night-mode` on `.sankofa-bird-rig`.
- map.tsx and request-active.tsx both pass `skyTier={useSolarTier(...)}` — auto-switches at civil twilight (NOAA math, no API).
- `nightMode` boolean prop is kept for backward-compat but `skyTier` is preferred.

**Why:** Night mode was previously just a CSS filter overlay on the whole rig. Phase 10 makes each biological element respond independently to low-light conditions, matching the "real nocturnal traveller" design spec.

**How to apply:** When adding night-specific effects: gate on `[data-night-mode="true"]`, add battery-saver and reduced-motion guards, target individual element classes (not the whole rig filter), and for high-cost effects restrict to `[data-zoom="high"]` or `[data-zoom="street"]`.
