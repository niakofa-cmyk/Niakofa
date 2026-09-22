---
name: Niakofa seed-test-accounts production guard
description: Why the Replit dev DB trips the "looks like production" guard in seed-test-accounts.ts
---

`scripts/src/seed-test-accounts.ts` refuses to run unless `DATABASE_URL` matches `/localhost|127\.0\.0\.1|replit/i`, or `--i-know-this-is-production` is passed. Non-local seeding also requires explicit passwords for all three test accounts.

**Why:** Replit's own managed Postgres uses an internal hostname like `helium`, which doesn't match any of those patterns — so the guard treats the Replit dev DB as if it were production, even though it's safe to seed.

**How to apply:** on a fresh Replit dev DB with an empty `users` table, run `pnpm --filter @workspace/scripts run seed-test-accounts -- --i-know-this-is-production`; local/dev fallback passwords remain available for disposable development only. For any non-local target, set unique `SEED_ADMIN_PASSWORD`, `SEED_HELPER_PASSWORD`, and `SEED_USER_PASSWORD` values before running.
