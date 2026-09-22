---
name: Niakofa map mobile control consolidation
description: map.tsx's floating control layout was rebuilt from ad-hoc absolutely-positioned buttons into a small fixed set of shared rows; follow this convention for future additions instead of reintroducing magic-number positioning.
---

## The problem this fixed

`map.tsx` had accreted 6+ independently absolutely-positioned floating elements
(Traffic/Heat/Language/Category-urgency buttons at `left-4/24/44/[188px]`, a
zoom +/- stack, a conditionally-rendered recenter button, a `bottom-[322px]`
Resume Compass button, and up to 3 different top-center banners), each added
for one feature with no shared layout system — causing overlap bugs every
time a new feature landed.

## The convention now in place

- **Bottom control row** (`bottom-32`, `left-4 right-4`, flex row): exactly
  two `flex-1` pill triggers, "Filters" (category/urgency/helper-language —
  "who/what to show") and "Layers" (traffic/heatmap toggles — "how to render
  the map"). Each opens its own bottom-sheet popup anchored to itself via a
  `relative` wrapper + `absolute bottom-full`.
- **Secondary row** (`bottom-48`, `left-4 right-4`, flex `justify-between`):
  OrientationToggle (left, now renders in-flow — no longer self-positions
  with `absolute`) and an ALWAYS-rendered circular Recenter button (right).
  Recenter is disabled (not hidden) when there's no location fix yet, and
  visually dims when already centered — a control that dims is less
  disorienting than one that pops in/out.
- **Request Help FAB** (requester-mode primary CTA): `bottom-64`, centered —
  sits above both rows.
- **On-screen zoom +/- buttons were removed entirely** — native pinch-to-zoom
  only, per explicit design decision (not an oversight).
- **Single top-center "status slot"**: one `mapStatus` computed value
  (priority: resume-compass > search-this-area > browsing-this-area >
  coverage-outside-pool-area > helper-waiting-for-requests) renders into ONE
  fixed-position wrapper (`top-20 left-4 right-24`). Only one message shows
  at a time — they take turns instead of stacking. Coverage-outside and
  helper-waiting are meaningful even without the interactive map, so they're
  the only two NOT gated on `!mapError`.

**Why:** every prior fix to one floating button's position broke another's
(documented via a critique doc + HTML mockup walkthrough on 2026-07-12).
Using the same fixed Tailwind scale steps (`bottom-32/48/64`, not arbitrary
`[Npx]` values) for all rows is what makes new elements composable instead
of collision-prone.

**How to apply:** any new map-screen toggle/filter belongs inside the
existing Filters or Layers sheet (or a new one on the same row pattern), not
as a new standalone absolutely-positioned button. Any new transient message
belongs as a new case in the `mapStatus` priority chain, not a new banner
position.
