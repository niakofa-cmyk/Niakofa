---
name: Niakofa helper suspension/approval visibility gate
description: Why a suspended or unapproved helper can still appear "available" if the enforcement isn't layered.
---
- A single `helper_mode_active` boolean is not sufficient to keep a suspended/unapproved helper off the map — it can go stale the moment an admin action fires if nothing re-checks it downstream.
- Enforce the gate at three independent layers: (1) the availability *query* itself (e.g. `GET /helpers/online`) must filter on `is_suspended=false` and approval status, not just the mode flag; (2) the mode-*toggle* endpoint must re-check suspension/approval before allowing a helper to go active, since a stale "approved" status row can outlive a suspension; (3) any admin action that suspends/denies a helper must broadcast a "helper offline" event so clients with the marker already in local state drop it immediately, not just on next poll/refetch.
- **Why:** clients that cache live markers from a WS feed only remove them on an explicit offline event — a DB-only fix (flipping `is_suspended`) is invisible to already-connected clients until they refresh.
- **How to apply:** whenever adding a new "who's currently available" surface or a new moderation action, check that all three layers are wired, not just the one that happens to be closest to the change being made.
