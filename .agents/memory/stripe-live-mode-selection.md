---
name: Stripe live-mode selection
description: Explicit mode selection required for Stripe MCP reads against Niakofa's live account.
---

Stripe MCP resource and search reads must pass an explicit `livemode` value.
For production reconciliation, confirm the selected Niakofa account is live and
set `livemode: true`; do not rely on an implicit default. Confirm processing
fees from the BalanceTransaction rather than estimating them from a percentage.

For API-key authentication checks, use a read-only account retrieval and verify
the intended mode from the configured key prefix (`sk_live_` or `sk_test_`).
Stripe Account responses may omit a `livemode` field, so a missing field is not
evidence that a key is in test mode.

**Why:** Omitting the mode returned HTTP 422, while an explicit live-mode read
returned the authoritative gross, fee, net, and fee-detail records.
An account retrieval also accepted the configured live key while omitting
`livemode` from its response, so treating the absent property as `false` caused
a false mode mismatch.

**How to apply:** Pass the intended `livemode` value on every Stripe MCP read.
For pool reconciliation, inspect the BalanceTransaction's `fee`, `net`, and
`fee_details` before interpreting a ledger difference. For credential smoke
checks, avoid creating payment objects; require both a successful API response
and a key prefix matching the intended mode.
