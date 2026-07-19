---
name: Niakofa worker registry
description: Worker health tracking system — how to keep worker status visible to admins when Redis drops.
---

## Rule
All background workers (pledge-worker, payout-worker, cashout-worker, etc.) gate on Redis being configured.
If Redis drops silently, money-movement jobs stop while the app looks healthy.

## Fix
`artifacts/api-server/src/lib/worker-registry.ts` — global Map tracking each worker's status:
- `registerWorker(name, label, redisRequired)` — declare at startup
- `workerStarted(name)` / `workerNoRedis(name)` / `workerFailed(name, err)` — call after each start
- `getWorkerHealth()` — returns array for admin endpoint

## Admin surface
`GET /api/admin/worker-health` — admin-only, returns `{ status, redis_configured, workers[] }`.
Displayed in admin.tsx "System" tab (new, 2026-07).

## How to apply
When adding a new worker in index.ts: call `registerWorker(...)` before the Redis check, then call
the appropriate status function after starting. Never leave a worker unregistered.
