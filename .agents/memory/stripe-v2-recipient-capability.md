---
name: Stripe Accounts v2 recipient capability
description: Durable payout rule for destinations that look transfer-ready in Accounts v1 but are rejected by Stripe Accounts v2.
---

Do not treat `capabilities.transfers = active` from an Accounts v1 object as
proof that a destination can receive platform Transfers. Accounts v2 also
requires the recipient configuration capability
`stripe_balance.stripe_transfers`.

**Why:** Stripe can return fully active V1 capabilities for an onboarded
Standard or Express destination and still reject `transfers.create` with
`insufficient_capabilities_for_transfer`. Stripe rejects this before moving
money, so repeated retries cannot succeed until account configuration changes.

**How to apply:** Classify `insufficient_capabilities_for_transfer` as a
definitive configuration failure. Discard payout retries, record an actionable
failure state, and safely restore reserved cashout balances exactly once.
Continue treating connection failures and request timeouts as ambiguous:
reconcile them and never auto-refund while transfer outcome is unknown.