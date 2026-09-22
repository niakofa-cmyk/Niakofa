---
name: Niakofa nullable-FK ripple effects
description: Making a user-owning FK nullable (for account-deletion safety) can break downstream code that still assumes it's non-null — check writers, not just joins.
---

Making a table's owning FK nullable (`ON DELETE SET NULL`, e.g. `wallet_cashouts.user_id`)
to prevent cascade data loss on account deletion is the right fix for the *join/query*
side, but it ripples into every downstream write path that reads that column expecting
a `number`, not `number | null` — e.g. `scheduler.ts`'s cashout-reconciliation cron passed
`row.user_id` straight into a Stripe transfer builder and a `transactionsTable` insert
(both typed non-null), which `tsc --build` caught as a type error, not a runtime crash.

**Why:** a cashout for a since-deleted account has no wallet left to credit/debit and no
ledger owner to attribute the entry to — guessing is worse than escalating.

**How to apply:** when auditing/fixing a nullable-FK-vs-INNER-JOIN class of bug, also grep
every place that later *writes* using that same row's FK column (balance updates, ledger
inserts, third-party API calls keyed by user id) and add an explicit `if (id == null)`
early-return that escalates to manual review (mirrors the existing "missing destination"
escalation pattern), instead of only fixing the join.
