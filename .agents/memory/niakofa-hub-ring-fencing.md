---
name: Niakofa hub pledge ring-fencing
description: Migration 0057 ring-fencing rule — hub-tagged pool money must never be spendable outside its own hub
---

## The rule
`community_pool_ledger.hub_id` marks money as earmarked for one diaspora hub.
`payHelperFromPool()` enforces:
- hub-scoped request (has `hub_id`) → can only draw from that hub's own reserved balance (sum of its ledger rows), never the global pool.
- non-hub-scoped request → can only draw from the *unrestricted* pool = global balance minus the sum of every hub's positive reserve. It must never dip into money earmarked for a hub.

`diaspora_hubs.reserved_balance` is a denormalized cache of the live ledger sum, kept in sync by `syncHubReservedBalance(hubId, tx)` — this MUST be called inside the *same transaction* as any ledger insert/update that touches `hub_id`, or the cached balance drifts from the source of truth.

**Why:** the whole point of a hub pledge is a promise-integrity guarantee — money pledged to hub A during a crisis must not silently fund an unrelated request elsewhere. Any money-in path that forgets to tag `hub_id` breaks that promise invisibly (funds land in the "unrestricted" pool instead).

**How to apply:** every place that credits the pool with hub-destined money (Stripe webhook `hub_pledge` handler, dev-mode griot pledge route, any future gov-sponsor-to-hub funding path) must pass `hubId` through to `recordPoolContribution()` and call `syncHubReservedBalance` in the same tx. Every place that debits the pool for a request must pass `hubId: request.hub_id` into `payHelperFromPool()`.
