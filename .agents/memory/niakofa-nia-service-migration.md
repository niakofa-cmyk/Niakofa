---
name: Niakofa nia-service migration resilience
description: Critical bugs in nia-service/migrate.sql and runMigrations() that block nia_enabled=false seed in production
---

## Bug: DATE(created_at) in index expression — NOT IMMUTABLE

`nia_cost_log_daily_idx` originally used `DATE(created_at)` where `created_at` is `TIMESTAMPTZ`. PostgreSQL rejects this because `TIMESTAMPTZ → DATE` conversion depends on the session timezone (NOT IMMUTABLE). Error in Railway logs: `functions in index expression must be marked IMMUTABLE`.

**Fix:** Change to `(created_at DESC, model)` which is actually useful for daily-cost-by-model admin queries and requires no function call.

**Why it's catastrophic:** `runMigrations()` ran the ENTIRE `migrate.sql` as one `pool.query()` call. When the index statement failed, ALL subsequent statements never ran — including `CREATE TABLE system_settings` and the `INSERT INTO system_settings VALUES ('nia_enabled','false',…) ON CONFLICT DO NOTHING`. This means `nia_enabled` was never seeded, leaving its status undefined (fail-closed code defaults to false, so Nia was disabled, but the admin toggle had no row to update against).

## Fix: runMigrations() statement-by-statement execution

`nia-service/src/lib/db.ts::runMigrations()` now:
1. Reads the SQL file
2. Splits on `/;[ \t]*(?:\r?\n|$)/` to get individual statements
3. Runs each statement with its own `pool.query()` in a try/catch
4. Logs non-fatal errors and continues — never blocks subsequent idempotent statements

All statements in `migrate.sql` are idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), so this is always safe.

## Fix: migration 0004 geography columns — PostGIS guard

`lib/db/migrations/0004_slow_may_parker.sql` adds `geography(Point, 4326)` columns to `users` and `help_requests`. Railway PostgreSQL 18 does NOT have PostGIS installed, so this crashes on fresh DB provisioning.

**Fix:** Wrap in a `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN … END IF; END; $$;` block. When PostGIS is absent, the block silently skips with a NOTICE. The api-server already has a Haversine fallback so this column is not required for correct operation.

**Why:** The `run-migrations.mjs` script already handles `CREATE EXTENSION IF NOT EXISTS postgis` gracefully (try/catch), but the individual migration files that use PostGIS types were not guarded.

## Duplicate index pitfall

After changing `DATE(created_at)` to `(user_id, created_at)` in the daily index, it became identical to `nia_cost_log_user_idx (user_id, created_at)`. Always check for duplicates when fixing non-IMMUTABLE indexes — change the index to serve a genuinely different query shape.
