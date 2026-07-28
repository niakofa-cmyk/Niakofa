---
name: Niakofa multi-helper payment splitting
description: How the pledge amount is split across co-helpers on request completion, and the ledger constraint that shaped the design.
---

Community pool ledger has a **partial unique index on (entry_type, request_id)** for
`helper_front` and `guaranteed_minimum` — only ONE debit row per request per type is
allowed, by design (prevents double-fronting). This means you cannot call the
single-helper `payHelperFromPool` once per co-helper for the same request.

**How the split works instead:** `payHelpersFromPool` (community-pool.ts) does ONE
ledger debit for the full pledge (same unique-index guard, same advisory lock/ring-fencing
checks as the solo path), then loops and credits each helper's `benevolence_wallet` +
writes their own `transactionsTable` row for their share. Called from requests.ts'
completion handler with an equal split across `[primaryHelperId, ...coHelperIds]`.

**Scope decision:** only the pledge (`helper_front`) is split. `guaranteed_minimum`
top-ups stay primary-helper-only intentionally — splitting the minimum-wage floor
across co-helpers would let fake/no-op co-helpers farm guaranteed-minimum payouts.
Immediate-pay Stripe Connect payouts also stay primary-only (splitting real Stripe
transfers across multiple connected accounts was out of scope for this pass — flagged
as a known gap, not silently dropped).

**Why:** the doc/audit that prompted this called flat +1 goodwill-only co-helper credit
"not full payment splitting yet" and named it the one remaining structural economic gap.
