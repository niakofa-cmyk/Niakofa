---
name: Niakofa rate limiter
description: Auth rate limiter config and behavior during test loops.
---

## Config
`authLimiter` is 10 requests per 15-minute window (in `artifacts/api-server/src/middlewares/rate-limit.ts`).
Applied to `POST /api/users/login` and `POST /api/users/register`.

## Behavior
Rapid test loops (e.g. curl in bash scripts) will hit 429 after ~10 requests from the same IP.
This is **correct behavior** — the security is working. Not a bug.

**Why:** Protects against brute-force attacks on auth endpoints.
**How to apply:** When testing auth endpoints, use different IPs or wait 15 minutes between test batches.
