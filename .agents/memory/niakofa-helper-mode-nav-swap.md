---
name: Niakofa helper-mode nav swap
description: BottomNav fully swaps tab sets by helperModeActive; Profile lives only in TopBar avatar now, not bottom nav.
---

BottomNav.tsx tab sets are now genuinely different arrays per mode, not the
same 5 tabs with one route swapped:
- Helper Mode OFF: Community / Map / Circles / Wallet (flat, no center button).
- Helper Mode ON: Earnings (/helper-dashboard) / Nearby (/, map already filters
  claimable when helperModeActive) / Active Job (center, dynamic —
  `/request/:activeRequestId` if one exists, else falls back to "/") / Circles.

**Why:** Wallet and Circles previously had built pages+routes with zero
bottom-nav discoverability. Profile was dropped from the bottom nav entirely
to make room — this is safe because TopBar already has an avatar button that
opens /profile in both modes; don't re-add Profile to BottomNav without
removing something else, and don't assume Profile is unreachable just
because it's not in the tab bar.

The notification bell (unread badge) moved off "whichever tab happens to be
last" and is now a standalone floating button pinned to the nav bar itself
(top-right corner, `absolute` inside the `fixed` nav), so it doesn't depend
on which tab set is showing.

**How to apply:** If asked to add another bottom-nav destination, there is
no free slot in either 4-tab set without removing something — decide what to
cut or consider a secondary entry point (like the map's own FAB, below)
instead of growing the tab bar past 4-5 items.

## Map screen now owns request creation
The bottom nav no longer has a center "+" button. Instead, `map.tsx` renders
its own "Request Help" FAB (`bottom-32 left-1/2 -translate-x-1/2`, only when
`!helperModeActive`) that navigates to `/request/new`. If Map screen layout
changes, keep this FAB clear of the zoom controls (right column) and the
existing left-side filter pills (all at `bottom-32` on the left side).

## diaspora_hub_pledges cascade-delete gap
`hub_pledges.pledged_by` is `ON DELETE CASCADE` on `usersTable` — a real
money-pledge record disappears if the pledging user deletes their account.
Fixed by blocking self/admin account deletion (409) if the user has ANY row
in `diasporaHubPledgesTable` (not just active-status ones — even
cancelled/fulfilled pledges are audit history), mirroring the existing
open-request cascade guard in `users.ts`. If a new financial/audit table
gets a user FK, check whether it needs the same guard rather than assuming
`ON DELETE CASCADE` is fine because "it's just a join table."
