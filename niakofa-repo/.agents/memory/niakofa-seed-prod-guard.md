---
name: Niakofa seed-test-accounts production guard
description: Why the Replit dev DB trips the "looks like production" guard in seed-test-accounts.ts
---

`scripts/src/seed-test-accounts.ts` refuses to run unless `DATABASE_URL` matches `/localhost|127\.0\.0\.1|replit/i`, or `--i-know-this-is-production` is passed.

**Why:** Replit's own managed Postgres uses an internal hostname like `helium`, which doesn't match any of those patterns — so the guard treats the Replit dev DB as if it were production, even though it's safe to seed.

**How to apply:** on a fresh Replit dev DB with an empty `users` table, run `pnpm --filter @workspace/scripts run seed-test-accounts -- --i-know-this-is-production` (defaults are fine for dev). The script has a built-in default admin email/password (see `scripts/src/seed-test-accounts.ts` — do not copy the value into memory or docs); override both via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` for anything beyond a throwaway local DB.
