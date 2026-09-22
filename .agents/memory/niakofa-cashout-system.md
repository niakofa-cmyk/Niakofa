---
name: Niakofa Cashout System
description: Durable financial invariants and design decisions for the benevolence_wallet cashout flow.
---

# Cashout — invariants that must never be violated

## Stripe idempotency parity (critical)
All three paths that call `stripe.transfers.create` with key `cashout-${id}` — the route (Phase 2), the BullMQ worker, and the reconciliation cron — MUST use `buildCashoutTransferParams()` from `lib/stripe-cashout.ts`. Stripe idempotency requires **exact parameter parity**; different descriptions or metadata keys cause `idempotency_key_mismatch`, which is treated as ambiguous → no auto-refund, escalates to `reconciliation_required`.

**Why:** A server crash between Stripe succeeding and the DB write leaves `stripe_transfer_id IS NULL` but money already sent. Replaying with the same key safely returns the original transfer only when params match.

**How to apply:** Never add per-attempt fields (retried, attempt, reconciled_by) to the canonical metadata. Those can change per call and break idempotency.

## isAmbiguousStripeError (shared, in lib/stripe-errors.ts)
Import this function — never define it inline. It classifies: `StripeConnectionError`, `request_timeout`, `idempotency_key_mismatch`, `idempotency_key_in_use`, and Node codes (ETIMEDOUT, ECONNRESET, etc.) as ambiguous. Everything else is definitive.

**Why:** The refund/no-refund decision is a financial one, not a logging one. Inconsistent classification between callers can double-pay or under-refund.

## Reconciliation cron rule
NEVER auto-refund based on `stripe_transfer_id IS NULL` alone. Always perform a Stripe probe (same idempotency key) first. The probe is authoritative: transfer returned → mark completed (no balance change); definitive rejection → refund + `permanently_failed`; ambiguous → `reconciliation_required`.

## State machine
`pending` → Phase 1 done, Stripe not yet called  
`failed` → Stripe failed; BullMQ retry queued; wallet still debited  
`completed` → Stripe confirmed; ledger written  
`reversed` → Stripe reversed; wallet restored  
`permanently_failed` → all retries exhausted, no transfer; wallet refunded  
`reconciliation_required` → ambiguous outcome; NEVER auto-refund; operator must verify

## transfer.reversed webhook hardening
Resolves `user_id` from `wallet_cashouts` by `cashout_id` if metadata is missing — so wallet restoration is not metadata-fragile. `transfer.created` is audit-only (records `stripe_transfer_id`); all state changes are owned by Phase 3 and the worker.
