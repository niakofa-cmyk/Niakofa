---
name: Pool History accounting
description: Durable product decisions for Community Pool contributor History and sponsor attribution.
---

Community Pool accounting remains authoritative in the pool ledger and
financial-events records. Personal History is a linked projection intended for
member-facing activity, not a replacement ledger.

**Why:** Contributors need to see what they funded, while Stripe fees, Climate
deductions, net settlement, currency, and availability must remain auditable
without misleading users by presenting net as the contribution headline.

**How to apply:** Use the gross contribution for the History amount and keep
the settlement breakdown in metadata. Link by pool ledger ID, and update the
existing History projection when a settlement adjustment arrives instead of
creating a duplicate. Government sponsor funds should not be attributed to the
administrator who recorded them as a personal contribution.

Refunds from Stripe are cumulative at the Charge level; reverse only the
incremental net amount against the pool and create separately linked,
idempotent refund History projections. A full refund marks the financial event
failed, while partial refunds preserve the original settlement state.

**Why:** A charge can receive multiple partial refunds and repeated webhook
deliveries. Reversing the cumulative amount on every delivery would overdraw
the pool and duplicate member History.

**How to apply:** Serialize refund calculations on the original financial
event, derive the target reversal from the cumulative refund ratio, subtract
prior refund adjustments, and use a stable refund identity for inserts.

Repayments always replenish the immutable community or hub scope recorded by
the original helper-front ledger entry, even if the requester later travels or
changes their profile community.

**Why:** Current GPS location is routing context, not ownership of historical
funds. Rejecting a repayment after travel strands valid debt and disagrees with
the Stripe webhook accounting path.

**How to apply:** Authorize the requester and repayment amount, then post to the
original front-ledger scope without comparing it to the requester's current
community assignment.

When reconciling a pool balance, compare the gross ledger contribution with the
linked Stripe BalanceTransaction's authoritative fee and net. A later negative
adjustment can reflect the difference between an already-recorded gross row and
the Stripe net; the public ledger may omit the payment-intent linkage needed to
prove that relationship.

**Why:** A production county-pool review found a gross contribution, a separate
negative adjustment, and a Stripe processing fee with matching amounts, but the
public ledger projection did not expose the private settlement linkage. The
private financial event is needed to establish exact provenance.

**How to apply:** Read `fee_details` from the live BalanceTransaction and verify
the corresponding private financial event or adjustment note before claiming
that a particular ledger row belongs to that payment. Do not label a matching
amount as tax or perform a repair based on amount equality alone.

The adjustment row's `user_id` identifies the PaymentIntent contributor, not
the operator who wrote the row. The Stripe webhook and admin repair endpoint
share the same settlement writer; the webhook log omits the PaymentIntent ID,
the repair log does not identify the admin actor, and the settlement writer
does not create an actor audit event.

**Why:** Amount matching and contributor identity do not establish who initiated
the accounting write or whether it came from the webhook or an admin repair.

**How to apply:** Attribute a pool adjustment only after correlating its exact
PaymentIntent and settlement rows with an actor-bearing audit record. Otherwise
report the recording path or person as indeterminate.
