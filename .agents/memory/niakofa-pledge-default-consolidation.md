---
name: Niakofa pledge default consolidation
description: Step 6 removed from pledge-worker.ts; scheduler.ts::processPledgeDefaults is the single source of truth for 90-day auto-defaults.
---

## Decision: scheduler.ts is the sole owner of pledge auto-default logic

**What changed**: pledge-worker.ts previously had a Step 6 that auto-defaulted pledges >90 days outstanding, identical to `scheduler.ts::processPledgeDefaults`. Both were safe because the atomic `WHERE pledge_status='active'` guard prevented double-processing, but the duplication created drift risk.

**Step 6 was removed from pledge-worker.ts.** The `scheduler.ts::startPledgeDefaultWorker` (runs via setInterval every 12 h) is now the sole owner.

## Why scheduler.ts not pledge-worker.ts

`startPledgeDefaultWorker` in scheduler.ts works WITHOUT Redis (setInterval-based). pledge-worker.ts runs via BullMQ and only starts when Redis is configured. The scheduler is always available, the BullMQ worker is conditional. Auto-defaulting pledges is a critical safety-net operation — it should not depend on Redis being up.

## processPledgeDefaults is exported

`processPledgeDefaults()` in `scheduler.ts` is exported for testability. The regression test suite is at `src/__tests__/pledge-default-parity.test.ts`.

## Atomic guard still matters

The `WHERE pledge_status='active'` guard in the update is still critical — prevents double-processing if two scheduler instances race on the same overdue row (e.g. multi-instance Railway deployments). Never remove this guard when modifying the auto-default logic.

## How to apply

If you ever need to change auto-default eligibility, penalty amounts, or notification copy:
- Edit ONLY `scheduler.ts::processPledgeDefaults`
- The comment block at the removed Step 6 location in pledge-worker.ts explains the consolidation for future readers
