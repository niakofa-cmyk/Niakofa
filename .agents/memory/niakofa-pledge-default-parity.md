---
name: Niakofa pledge default parity
description: Scheduler and pledge-worker must use identical eligibility for 90-day auto-default; repayment endpoint must be atomic; reminder dedup must span both workers.
---

## The rule
When two workers can produce the same outcome (pledge auto-default), their **eligibility query must be identical** or outcomes become non-deterministic regardless of the atomic update guard.

## What was wrong
- `scheduler.ts::processPledgeDefaults()` filtered `pledge_paid = 0` (zero-payment only)
- `pledge-worker.ts` Step 6 filtered `pledge_paid < pledge_amount` (any unpaid balance)
- `scheduler.ts` didn't exclude hardship rows; pledge-worker did

This meant which worker "won" the race determined both the outcome (penalty or no penalty) AND who got notified.

## The fix
Both workers now use identical criteria:
```sql
pledge_paid < pledge_amount   -- any outstanding balance, not just zero
hardship_requested_at IS NULL  -- hardship exemption in both workers
```
The atomic `WHERE pledge_status='active'` guard then ensures only one worker actually applies changes.

## Atomic repayment rule
`POST /requests/:id/pledge-repay` must use SQL INCREMENT, not read-compute-write:
```sql
SET pledge_paid = LEAST(COALESCE(pledge_paid,0) + :amount, pledge_amount)
```
Add a WHERE guard `COALESCE(pledge_paid,0) < pledge_amount` + RETURNING to detect concurrent completion. Never compute `newPaid = request.pledge_paid + amount` in application code — this loses updates under concurrency.

**Why:** Two simultaneous repayments read the same `pledge_paid` value, both compute `newPaid`, both write it — second write silently discards first payment while both ledger entries are inserted, creating accounting drift.
