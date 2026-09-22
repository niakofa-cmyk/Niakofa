---
name: Niakofa Sankofa bird nav marker vs static bird nav-toggle icon
description: Two unrelated "sankofa bird" features exist in this app — don't conflate them when searching for or extending bird-related UI.
---

There are two separate, non-conflicting "Sankofa bird" pieces of UI in this codebase:

1. **Static PNG nav-menu toggle** (pre-existing): `BottomNav.tsx` renders `/sankofa-bird.png`
   (precached by `public/sw.js`) as the tappable button that opens the bottom nav menu.
   Purely decorative/branding, not animated, not related to location or heading.

2. **Animated SVG heading marker** (`src/components/SankofaBird.tsx`): replaces the plain
   pulsing-dot `<Marker>` for the user's own location on `map.tsx` and `request-active.tsx`.
   Driven by props: `heading` (compass degrees), `mapBearing` (0 in north-up, live heading in
   heading-up camera mode — same convention as `LocationPuck.tsx`), `speed` (m/s, drives flap
   rate + forward lean), `navigating` (bool, true on request-active screen).
   - Bank angle is computed from the *rate of heading change* (turn rate), not raw heading, so
     it only banks during actual turns — a steady heading gives zero bank even at speed.
   - Respects `prefers-reduced-motion` (all CSS keyframe animations disabled).

**Why this note exists:** grepping for "sankofa" turns up both; searching component filenames
alone can make it look like the animated marker already existed when only the static icon did.
Always check the actual import site (`@/components/SankofaBird` vs a literal `/sankofa-bird.png`
string) before assuming which one a piece of code references.
