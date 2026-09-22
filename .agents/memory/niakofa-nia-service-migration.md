---
name: Niakofa nia-service migration resilience
description: Critical bugs in nia-service/migrate.sql and runMigrations() that block nia_enabled=false seed in production
---

## Bug: DATE(created_at) in index expression — NOT IMMUTABLE

`nia_cost_log_daily_idx` originally used `DATE(created_at)` where `created_at` is `TIMESTAMPTZ`. PostgreSQL rejects this because `TIMESTAMPTZ → DATE` conversion depends on the session timezone (NOT IMMUTABLE). Error in Railway logs: `functions in index expression must be marked IMMUTABLE`.

**Fix:** Change to `(created_at DESC, model)` which is actually useful for daily-cost-by-model admin queries and requires no function call.

**Why it's catastrophic:** `runMigrations()` ran the ENTIRE `migrate.sql` as one `pool.query()` call. When the index statement failed, ALL subsequent statements never ran — including `CREATE TABLE system_settings` and the `INSERT INTO system_settings VALUES ('nia_enabled','false',…) ON CONFLICT DO NOTHING`. This means `nia_enabled` was never seeded, leaving its status undefined (fail-closed code defaults to false, so Nia was disabled, but the admin toggle had no row to update against).

## Fix: runMigrations() statement-by-statement execution — CRITICAL FILTER BUG

`nia-service/src/lib/db.ts::runMigrations()` now:
1. Reads the SQL file
2. Splits on `/;[ \t]*(?:\r?\n|$)/` to get individual statements
3. **Filters using `replace(/--[^\n]*/g,'').trim().length > 0`** — do NOT use `!s.startsWith("--")`
4. Runs each statement with its own `pool.query()` in a try/catch
5. Logs non-fatal errors and continues — never blocks subsequent idempotent statements

All statements in `migrate.sql` are idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), so this is always safe.

**CRITICAL BUG — `!s.startsWith("--")` silently drops 7 statements:**
When migrate.sql has a SQL comment block BEFORE a statement (e.g. `-- Seed nia_enabled...` then `INSERT INTO system_settings`), after splitting on `;`, the segment STARTS with `--`. The original filter `!s.startsWith("--")` then DROP that entire statement. This caused:
- `ALTER TABLE nia_conversations ADD COLUMN is_crisis` — dropped
- `ALTER TABLE nia_memories ADD COLUMN structured` — dropped
- `CREATE TABLE system_settings` — dropped
- `INSERT INTO system_settings (nia_enabled=false)` seed — dropped (nia kill-switch has no row!)
- `CREATE TABLE nia_knowledge` — dropped → index on it fails "relation does not exist"
- `CREATE TABLE push_notification_queue` — dropped → index fails
- `CREATE TABLE nia_cost_log` — dropped → all 3 indexes fail

**The correct filter:** Strip comments first, then check if any actual SQL remains:
```typescript
.filter(s => { if(!s.length) return false; return s.replace(/--[^\n]*/g,'').trim().length > 0; })
```
This keeps leading-comment statements (passes full text including comments to pool.query(), which PostgreSQL handles correctly) and drops only pure-comment or empty segments.

## Fix: migration 0004 geography columns — PostGIS guard

`lib/db/migrations/0004_slow_may_parker.sql` adds `geography(Point, 4326)` columns to `users` and `help_requests`. Railway PostgreSQL 18 does NOT have PostGIS installed, so this crashes on fresh DB provisioning.

**Fix:** Wrap in a `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN … END IF; END; $$;` block. When PostGIS is absent, the block silently skips with a NOTICE. The api-server already has a Haversine fallback so this column is not required for correct operation.

**Why:** The `run-migrations.mjs` script already handles `CREATE EXTENSION IF NOT EXISTS postgis` gracefully (try/catch), but the individual migration files that use PostGIS types were not guarded.

## Duplicate index pitfall

After changing `DATE(created_at)` to `(user_id, created_at)` in the daily index, it became identical to `nia_cost_log_user_idx (user_id, created_at)`. Always check for duplicates when fixing non-IMMUTABLE indexes — change the index to serve a genuinely different query shape.
