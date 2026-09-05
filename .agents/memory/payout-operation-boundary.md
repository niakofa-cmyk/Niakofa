---
name: Payout operation boundary
description: Durable accounting and retry rules for Stripe helper payouts.
---

Requester charges and helper payouts are distinct financial operations. Keep the
requester charge in the payment ledger and the helper transfer in a dedicated
payout-operation ledger; do not weaken the one-completed-payment-per-request
rule to make both fit one table.

**Why:** Stripe can accept a transfer before the API records its result, and
Stripe idempotency keys have a finite retention period. A durable operation
must be claimed before the transfer, and retries must reconcile Stripe by a
stable transfer group and metadata before creating anything. Immediate
PaymentIntents must remain platform charges, or destination charges would pay
the helper once before the completion payout pays them again.

**How to apply:** Every entry point that can pay a helper must use the same
claim, Stripe reconciliation/create, and atomic finalization protocol. Never
add a direct transfer path or destination charge for immediate payments.

Direct helper tips use one settlement rail: a platform charge is credited to
the helper's internal Goodwill Fund by the signed webhook, then may be cashed
out through the normal durable cashout flow. Never combine a destination charge
with an internal wallet credit.

Pay It Forward card installments require one durable active PaymentIntent per
requester/request. Racing attempts must reuse the active intent and cancel any
duplicate Stripe intent before its client secret is returned.

**Why:** A destination transfer plus a cashout-able wallet credit pays the same
tip twice. Stripe idempotency keys also expire, so they cannot replace a
database-backed active-operation reservation.

**How to apply:** Keep the active authorized repayment unique in the database,
release it only through terminal payment state transitions, and make webhook
claims atomic with every wallet and ledger effect.