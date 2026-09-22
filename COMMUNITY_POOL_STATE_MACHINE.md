# Niakofa Community Pool State Machine

The Community Pool separates payment capture, provider settlement facts, and
operator payout confirmation. A status must never imply a later fact that has
not been independently recorded.

```text
Payment
  → Financial Event
  → Stripe Verified
  → Available
  → Operator Payout
  → Paid Out
```

## States and transitions

### 1. Payment

A Stripe PaymentIntent is created and confirmed. No pool balance is credited
from a client-side success response alone. The verified webhook/reconciliation
path supplies the authoritative Stripe identifiers and cents amounts.

### 2. Financial Event

`community_pool_financial_events` records the payment facts:

- `gross_amount_cents`
- `stripe_fee_cents`
- `climate_contribution_cents`
- `net_amount_cents`
- Stripe PaymentIntent, Charge, Balance Transaction, and optional Climate IDs

The invariant is:

```text
net_amount_cents =
  gross_amount_cents - stripe_fee_cents - climate_contribution_cents
```

All monetary components are non-negative integer cents, and gross must be
positive. The linked signed pool ledger stores the exact net dollars.

### 3. Stripe Verified

`stripe_verification_status = 'verified'` and `stripe_verified_at` are set only
after the Stripe records reconcile. Verification is not operator approval and
does not mean the funds were paid out.

### 4. Available

`settlement_status = 'available'` means Stripe reports the linked balance
transaction available. The database requires verification before this state.
The advancement worker never infers `paid_out`.

### 5. Operator Payout

An authenticated, authorized operator confirms that Niakofa released the
available funds. The transition is serialized with a row lock and requires a
non-empty payout reference. When configured, a live Stripe balance-transaction
check is repeated before mutation.

### 6. Paid Out

`settlement_status = 'paid_out'` is terminal. It requires:

- verified settlement;
- available state before the transition;
- `paid_out_at`;
- `paid_out_by`; and
- a non-empty `paid_out_reference`.

One `marked_paid_out` audit event is allowed per financial event. Audit rows are
insert-only and must not be rewritten or deleted.

## Pending guaranteed minimums

When a completion cannot be funded, the obligation is queued. FIFO applies
within the same `(community_id, hub_id)` fund scope. Separate scope queues are
processed independently so an empty community or hub cannot block an unrelated
fund that has enough balance. Historical unscoped rows remain pending until an
operator resolves their scope; they are never silently paid from another fund.