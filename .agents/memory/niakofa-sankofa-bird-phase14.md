---
name: Niakofa SankofaBird Phase 14
description: Phase 14 "Living Companion" — 7 effects, 5 new props, 4 SVG elements; key invariants and bug-fix lessons.
---

# SankofaBird Phase 14 — Living Companion

## Props added
`missionComplete`, `chirp`, `weather` (`"clear"|"rain"|"snow"`), `trustLevel` (0–1 → `trustTier`), `communityMilestone`

## Data-* attrs on the rig
`data-chirp`, `data-mission-complete`, `data-community-milestone`, `data-trust-tier`, `data-weather`

## SVG elements added (inside bird SVG)
`sankofa-nictitating`, `sankofa-adinkra-covert`, `sankofa-adinkra-breast`, `sankofa-adinkra-crown`

## Effects
- **P14.1** Chirp: beak-upper/lower CSS rotate animation + 3 arc rings outside the rig
- **P14.2** Mission complete: tail fan, 3 gold ripple rings outside the rig, glow-layer pulse
- **P14.3** Milestone shimmer: hue-wave staggered tail→body→wings→head
- **P14.4** Trust tier opacity ladder: none/growing/trusted/elder + elder crown pulse; LOD hide at mid/low zoom
- **P14.5** Weather: rain (desaturate+darken+head hunch) and snow (fluff bob + brightness); battery-saver preserves static snow filter
- **P14.6** Nictitating membrane: periodic horizontal sweep — rest period embedded in keyframe so loop fires correctly
- **P14.7** Heading momentum spring: JS inline `transition` on compass wrapper div based on `speedMs > 50`

## Critical invariants

### Overlay rings are OUTSIDE .sankofa-bird-rig
Chirp arc rings and mission ripple rings are DOM divs rendered as siblings of the compass wrapper, not descendants of `.sankofa-bird-rig`. Consequences:
1. CSS animation rules for them must be **unconditional class selectors** (`.sankofa-chirp-arc-ring`, `.sankofa-mission-ripple`) — data-attribute-scoped rig-descendant selectors never match them.
2. Conditional rendering (`{chirp && !batterySaver && ...}`) is the sole gate — the element's presence in the DOM is the gate.
3. The **global `@media (prefers-reduced-motion: reduce)` rule** (which targets `.sankofa-bird-rig *`) does NOT reach them. A separate `@media (prefers-reduced-motion: reduce)` block directly targeting `.sankofa-chirp-arc-ring` and `.sankofa-mission-ripple` is required.

### Nictitating membrane timing
The naive approach (`animation: 0.44s infinite; animation-delay: Xms`) only delays the first iteration — subsequent iterations fire immediately at 0.44s cadence. The correct approach: embed the rest period inside the keyframe (sweep in 0–4%, invisible 4–100%), set total duration = `blink-period × 3.2`, iterate infinitely. Busy/peak shortens to `blink-period × 1.9` via `animation-duration` override.

### P14.7 JS transition override
The compass rotation wrapper previously had Tailwind `transition-transform duration-150 ease-linear` classes that conflicted with the CSS spring rule. These were removed; the spring and airplane ease-out are now set via an **inline `style.transition`** computed from `speedMs > 50` at render time. The CSS `.sankofa-bird-container` rule serves only as a pure-CSS fallback.

**Why:** `transition` in an inline style has higher specificity than any CSS class or rule, giving reliable cross-browser override without `!important`.

### Battery-saver ring gating
Both ring types must be gated with `!batterySaver` in their conditional render (`{chirp && !batterySaver && ...}`). Since they are outside the rig, the rig's `data-battery-saver` CSS selector cannot suppress their animation.
