---
name: Niakofa hub pledge payments
description: Cross-hub crisis pledges (Griot Globe) are now real Stripe charges, not bare DB rows; covers auth gap and webhook idempotency fixes.
---

Migration 0055 added `stripe_payment_intent_id` to `diaspora_hub_pledges`; status lifecycle is
`pending_payment` → `pledged` (paid, pool credited) → `cancelled`, or `fulfilled` (future, unused).

**Why:** the original flow let any authenticated user attribute a pledge to *any* hub with no
payment, card, or authorization check — in a real crisis that's indistinguishable from a
false rumor that help is coming.

**How to apply:**
- `POST /griot/hubs/:id/pledges` requires the caller to be an approved leader of `from_hub_id`
  (or platform admin) via the existing `isHubLeaderOrAdmin()` helper — there is no general
  "hub resident" membership model, so this is intentionally leader/admin-scoped.
- Public pledge feed (`GET /griot/hubs/:id/pledges`) only ever shows `status='pledged'` rows —
  never `pending_payment`/`cancelled`, so a hub in crisis can't appear to have received money
  that never moved.
- The Stripe webhook flips status `pending_payment`→`pledged` AND inserts the
  `community_pool_ledger` row inside the SAME `db.transaction()` — if the ledger insert throws,
  the status flip rolls back too, so a webhook retry can safely re-attempt crediting instead of
  leaving a "pledged" pledge with no money ever credited to the pool.
- Dev mode (no `STRIPE_SECRET_KEY`) still records + credits instantly for local testing, same
  convention as `/pool/contribute`.
- The 24h per-user pledge velocity cap's SUM-check + INSERT must run inside one `db.transaction()`
  guarded by `pg_advisory_xact_lock(727503, userId)`, or concurrent requests race past the cap
  (checked independently, both pass, both insert). Community Pool's own lock is the distinct
  single-key `pg_advisory_xact_lock(727502)` — don't reuse either key elsewhere without checking
  both call sites.
