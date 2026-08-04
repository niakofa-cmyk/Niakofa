---
name: Niakofa SankofaBird Phase-2 final state
description: Complete inventory of all SVG elements and CSS state-machine rules as of Phase-2 completion; what was added and what known gaps remain.
---

## Phase-2 completion state — July 17 2026

### New SVG elements added (6 groups)
- `sankofa-neck-seg-1/2` — two thinner overlay paths on the neck stroke (stroke-width 1.8, opacity:0 in SVG — CSS shows at high/street)
- `sankofa-neck-top-sheen` — dorsal edge highlight path, stroke-width 0.55
- `sankofa-wing-covert-band-l/r` — one path per wing at the covert layer (layer 3), opacity:0 in SVG
- `sankofa-crown-tip-2/3/5` — 0.16–0.22r circles at crown feather tips, opacity:0 in SVG
- All new elements suppressed by `data-battery-saver="true"` and `prefers-reduced-motion`

### Body feather visibility fix (critical bug)
- Body feather rows 4–11 existed as SVG `<path>` elements and had `animation-delay` overrides
  but had NO `opacity` or `animation` CSS declaration to make them visible
- Added Phase-2 block rules: rows 4-6 opacity 0.13, rows 7-9 opacity 0.15, rows 10-11 opacity 0.12 (street only)
- All use `sankofa-body-feather-shimmer` (same keyframe as rows 1-3)

### --help-shimmer fix
- Was declared as `@property --help-shimmer { syntax: '<number>' }` but never set or used anywhere
- Phase-2: `.sankofa-bird-rig[data-helping="true"] { --help-shimmer: 1 }` sets it
- Used in orbit dot opacity: `calc(0.40 + var(--help-shimmer,0) * 0.32)` — smooth fade-in vs hard boolean

### Neck chain S-wave physics
- CSS `sankofa-neck-seg1-wave` and `sankofa-neck-seg2-wave` are phase-offset by 0.65s
- Bright peak appears to travel from body junction → head, like a travelling wave
- Only fires at `data-flying="false" data-landing="idle"`; neck-top-sheen adds dorsal edge

### New keyframes (Phase-2)
- `sankofa-neck-seg1-wave`, `sankofa-neck-seg2-wave`, `sankofa-neck-sheen-wave` (5.2s period)
- `sankofa-covert-band-flash` (3.2s, during flight at street zoom)
- `sankofa-crown-tip-pulse` (3.8s), `sankofa-crown-tip-alert` (notification flash, 4 iterations)
- `sankofa-tail-feather-iri` (4.8–5.5s, 4 tail feather classes with staggered delays)
- `sankofa-scap-breathe` (3.8s, scapular shoulder at street zoom)

### Prop wiring (confirmed correct — no changes needed)
- `map.tsx` line ~1611: `upcomingTurnDirection={birdUpcomingTurn}`, `isHelping={helperModeActive && !!activeRequestId}` — both already correct
- `request-active.tsx` line ~843: all props correct
- All 14 data-attributes on rig div confirmed present

### Still NOT done (non-blocking)
- `/bird-test` harness does not have cards for helping-orbit, perch-wing-fold, feather-rustle, covert-band, crown-tip states (visual QA only, not a functional gap)
- More LOD0 primary feather micro-paths (design doc: "hundreds" — current ~14/wing is a practical limit for CSS animation)

**Why:** Phase-2 goal was correctness (fix invisible feathers, wire dead CSS vars) + structural anatomy depth (neck chain, covert band, crown speculars) without touching prop wiring (already complete).
