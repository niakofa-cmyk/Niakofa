---
name: Niakofa pool depletion recovery
description: How queued guaranteed minimums + backfill work, and how to mint dev auth tokens for E2E testing
---

# Pool pending minimums (migration 0025)

- `payHelperFromPool` returns `"paid" | "insufficient" | "duplicate" | "error"` — callers must NOT treat it as boolean. On `insufficient` minimums, queue via `queuePendingMinimum` (unique request_id = queue-once).
- `processPendingMinimums()` backfills FIFO and **stops at the first row the balance can't cover** (preserves fairness). `duplicate` outcome also marks the queue row `paid` (a ledger minimum already exists).
- **Rule:** every code path that credits the pool must call `processPendingMinimums()` afterward (dev contribute, Stripe contribution webhook, fronted-pledge repayment) — the 10-min worker is only a safety net.
- **Why:** without event-driven backfill, helpers wait up to 10 min after a contribution; without the worker, a missed trigger strands the queue forever.
- Low-balance alert dedup (`maybeAlertLowBalance`) is process-local (6h) — fine single-instance, needs shared storage if multi-instance.

# Minting dev auth tokens for curl E2E tests

- Login needs real bcrypt passwords; instead sign tokens directly: write a temp script into `artifacts/api-server/src/` that imports `signTokenById` from `./middlewares/auth` + user `token_version` from DB, run with `npx tsx --tsconfig tsconfig.json`, then delete it.
- **Gotchas:** tsx runs CJS here — no top-level await (wrap in `async main()`); scripts in `/tmp` break relative imports, so the file must live inside the package.
