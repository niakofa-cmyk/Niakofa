---
name: Niakofa dev DB provisioning
description: How to provision an empty dev Postgres for Niakofa (PostGIS + migrations), why drizzle push fails.
---

Empty dev DB causes all API 500s and floods logs with `relation "help_requests" does not exist` / anomaly-worker errors. This is environment state, not a code bug.

## Correct provisioning sequence
1. `CREATE EXTENSION IF NOT EXISTS postgis;` — schema uses `geography(Point,4326)` columns (lib/db/src/schema/geography.ts customType). Without it, any table create fails with `type "geography(Point, 4326)" does not exist`.
2. Apply the migration SQL files in `lib/db/migrations/*.sql` in sorted order via `psql -f` (they include the PostGIS geog columns + triggers in 0004). Pre-existing enum "already exists" errors are harmless.

## Why `drizzle-kit push` does NOT work here
- **TTY**: push hits an interactive rename-conflict prompt and dies with "Interactive prompts require a TTY" in the agent shell (even `push-force`).
- **PostGIS table**: the `spatial_ref_sys` table (created by the postgis extension) triggers that rename-conflict resolver. Fix: add `extensionsFilters: ["postgis"]` to `lib/db/drizzle.config.ts` so drizzle ignores postgis-managed tables.
- **geography custom type**: even past the prompt, push emits the custom dataType as a quoted identifier `"geography(Point, 4326)"` → `type ... does not exist`. The geog columns are meant to come from the migration SQL, not push.

**Why:** push is interactive + can't emit the PostGIS custom type; the committed migration SQL is the source of truth for the geog columns/triggers. Use psql to apply migrations, not push.
