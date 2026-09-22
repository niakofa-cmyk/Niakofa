---
name: Niakofa REQUEST_ACCEPTED requester auto-navigate
description: map.tsx WS handler auto-navigates requester to /request/:id/track when their request gets accepted; global coverage still incomplete (only triggers from the map screen).
---

# REQUEST_ACCEPTED requester auto-navigate

**Rule:** In `map.tsx` WS callback, when `event.type === "REQUEST_ACCEPTED"` and `req.requester_id === currentUser.id`, call `setLocation("/request/${req.id}/track")` and return early. The `setLocation` must be in the `useCallback` deps array.

**Why:** Before this fix, the requester stayed on the idle map with no notification that a helper had claimed their request. The tracking screen shows real-time helper location.

**How to apply:** The fix is per-page (map only). A global AppContext-level listener covering all pages is a proposed follow-up task (#2). The WS payload from `broadcastRequestEvent` includes `requester_id` via the enriched request object.
