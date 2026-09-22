# Niakofa forensic hardening reference — 2026-09-12

## P0 implemented

1. **Spendable reconciliation in integer cents**
   - `reconcileSpendablePool()` compares Stripe **available** cents to ledger spendable cents.
   - Tolerance: **1 cent** only.
   - Pending Stripe funds are logged diagnostically and are **not** used to declare reconciliation OK.
   - Scheduler daily drift worker uses this model (replaces `$10` dollar threshold).

2. **Settlement DB invariants** — migration `0136_pool_settlement_invariants.sql`
   - `verified` ⇒ balance transaction id present
   - `available` / `paid_out` ⇒ balance transaction + `available_on`
   - `paid_out` ⇒ `available_on` present

3. **Read-only preflight** — `scripts/verify-community-pool-financial-integrity.sql`

## P1 implemented

4. **LiveKit token hardening**
   - TTL reduced from 4 hours → **20 minutes**
   - Publishers get explicit `canPublishSources`: camera, microphone, screen_share

## Operator steps after deploy

1. Run preflight SQL read-only; resolve any diagnostic rows.
2. Apply migration 0136 via normal migration runner.
3. Confirm worker logs say `within 1 cent` (not `$10`).
4. Confirm media-token responses include `expires_in: 1200`.

## Limits

Live Stripe delivery, authenticated pool matrix, and real LiveKit connectivity still require deployed acceptance tests.
