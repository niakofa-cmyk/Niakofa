---
name: Stripe live-mode selection
description: Explicit mode selection required for Stripe MCP reads against Niakofa's live account.
---

Stripe MCP resource and search reads must pass an explicit `livemode` value.
For production reconciliation, confirm the selected Niakofa account is live and
set `livemode: true`; do not rely on an implicit default. Confirm processing
fees from the BalanceTransaction rather than estimating them from a percentage.

**Why:** Omitting the mode returned HTTP 422, while an explicit live-mode read
returned the authoritative gross, fee, net, and fee-detail records.

**How to apply:** Pass the intended `livemode` value on every Stripe MCP read.
For pool reconciliation, inspect the BalanceTransaction's `fee`, `net`, and
`fee_details` before interpreting a ledger difference.
