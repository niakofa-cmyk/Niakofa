# Niakofa Community Pool webhook-trace hardening

This reference records the uploaded payment-intent trace and webhook
hardening archive. The original files remain in `attached_assets/`; the
compatible implementation was merged into the current source rather than
copied wholesale.

## End-to-end accounting path

```text
payment_intent.succeeded
  → Stripe Balance Transaction lookup
  → community_pool_ledger (+ settled net)
  → community_pool_financial_events (gross/fee/Climate/net + Stripe IDs)
  → transactions (gross pool_contribution History projection)
```

Stripe processor fees come from the Balance Transaction. The pool balance is
the signed net ledger, while member History keeps the gross headline and
settlement breakdown.

## Refund behavior

`charge.refunded` now recognizes pool contributions even though they have no
`payment_transactions` row. Stripe refund totals are cumulative, so each
webhook reverses only the incremental net amount:

```text
incremental net reversal =
  (original net × cumulative refund ratio) − prior net reversals
```

The original financial event becomes `failed` only after a full refund.
Reversal ledger rows and History rows use stable idempotency keys.

## Settlement behavior

A scheduled Stripe Balance Transaction check advances `pending` financial
events to `available` and updates the linked History metadata. No `paid_out`
state is inferred; that transition remains an explicit payout/operations
action.

## Operations verification

Use `scripts/verify-pool-migrations-and-pi.sql` against staging or production
to verify migrations 0115/0116, Balance Transaction IDs, amount
reconciliation, contributor History rows, orphans, and the net pool balance.

Live Stripe behavior still requires a controlled real contribution and refund;
offline tests cannot prove provider-side settlement or refund delivery.