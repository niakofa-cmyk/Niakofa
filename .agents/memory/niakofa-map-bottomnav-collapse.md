---
name: Niakofa map BottomNav collapse
description: BottomNav collapses to a tap-to-open handle on the map route only, to stop it overlapping MapControlsPanel's bottom-perched buttons.
---

BottomNav is rendered once in App.tsx (outside the route Switch), so it can't
be conditionally sized per-route from there. Instead `mapNavOpen` lives in
AppContext (`mapNavOpen` / `setMapNavOpen`), and BottomNav itself computes
`isMapRoute = location === "/"` and only applies collapse behavior there —
every other route always shows the full bar exactly as before.

- Collapsed (default on "/"): full `<nav>` translates off-screen
  (`translate-y-full pointer-events-none`); a small centered pill handle
  (chevron-up + unread dot) is shown instead, well under the ~48-60px
  MapControlsPanel bottom offset (`PERCH_BOTTOM`) so it can't recreate the
  overlap it exists to fix.
- Expanded: full nav slides up, with a chevron-down "close" button perched on
  its top edge (`-top-4`, centered) — separate from the notification bell,
  which stays at its usual `-top-4 right-3` spot on the nav itself.
- map.tsx reads `mapNavOpen` from context and folds it into
  MapControlsPanel's existing `controlsRecede` prop, so opening the nav also
  hides the settings/orientation/recenter buttons instead of letting the
  taller expanded bar cover them.

**Why:** BottomNav's real height (~64-90px incl. safe-area) is taller than
MapControlsPanel's PERCH_BOTTOM offset (~48-60px) — on the map screen the two
were structurally guaranteed to overlap; shrinking the nav wasn't viable
without breaking its own tap targets, so it hides by default there instead.

**How to apply:** any new floating chrome added to the map screen should
check whether it needs to react to `mapNavOpen` (recede/hide) the same way
MapControlsPanel does, since an expanded nav on "/" temporarily reclaims the
full bottom ~90px.
