---
name: Niakofa Community Pool
description: Design rules and safety invariants for the community pool that fronts helper pay and pays guaranteed minimums.
---

# Community Pool — invariants that must hold

- `community_pool_ledger` is a signed-amount append-only ledger; balance is always `SUM(amount)` — never store a running balance column.
- Pool debits (front / minimum) go through `payHelperFromPool` which takes `pg_advisory_xact_lock(727502)` inside a `db.transaction` — balance check + debit are atomic. Never debit the pool outside this path.
- Partial unique indexes enforce at most one `helper_front` and one `guaranteed_minimum` per request_id, and one contribution/repayment per `stripe_payment_intent_id`. Code treats 23505 as "already done, skip" — this is intentional, not an error.
- `/requests/:id/complete` has a status guard (`status NOT IN ('completed','cancelled')` in the UPDATE ... RETURNING). **Why:** without it, repeated complete calls re-ran the pool section and could pay a second guaranteed minimum on an already-fronted request (front dedup returned false → minimum branch fired).
- Stripe webhook idempotency gate: the `payment_transactions` UPDATE to `completed` includes `state != 'completed'` and RETURNING — no row back means retry, skip ALL side effects. All money mutations (pledge_paid, wallet/pool ledger) live in ONE db.transaction; the repayment ledger insert uses `onConflictDoNothing`.
- Fronted requests: requester repayment goes to the POOL (`pledge_repayment` entry), helper wallet is NOT credited again; `pledge_sent` is still recorded for the requester.
- All pool amounts pass through `roundMoney()` (cents rounding) and balance comparisons happen in whole cents (`toCents`). **Why:** columns are float/real; representation noise could flip `balance < amount`.
- Pool logic in `/complete` is wrapped in try/catch and must NEVER block task completion — degrade gracefully.
- Settings: `system_settings` keys `pool_enabled` (default true) and `pool_guaranteed_minimum` (default 5).
- Dev mode (no STRIPE_SECRET_KEY): `/pool/contribute` records the contribution directly; with Stripe it creates a PaymentIntent with `metadata.type = pool_contribution` which the webhook records idempotently.
