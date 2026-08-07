---
name: Niakofa hub claim required for pledges
description: Seed diaspora hubs start unclaimed (no community_id); pledging into them 422s until claimed — this is by design, not a bug.
---

All 13 seed rows in `diaspora_hubs` (Fort Worth, Atlanta, Kingston, etc.)
start with `community_id = NULL` and `is_seed = true`. `POST
/griot/hubs/:id/pledges` returns a 422 with a clear
"hasn't been linked to a community yet ... contact support" message for any
unclaimed hub — even the "home base" Fort Worth hub, even though a real
Tarrant County community row already exists in the DB.

**Why:** hub-to-community linking is an explicit, gated action
(`PATCH /griot/hubs/:id/claim`, admin or hub-leader-driven), not automatic —
pledges must never silently land in a hub with no real ledger backing.

**How to apply:** don't "fix" this by pre-linking hubs in a migration or
seed script. If a test needs a working pledge flow, call the claim endpoint
first. If a user reports pledges failing on a hub, check `community_id` is
set before assuming it's a bug.
