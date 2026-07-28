---
name: Niakofa DB migration workflow
description: How schema changes go to production now - generate+migrate, not push.
---

As of this change, schema changes to production go through migrations, not push:

1. Edit lib/db/src/schema/*.ts
2. cd lib/db && pnpm run generate -- writes a new numbered SQL file to lib/db/migrations/, lets you review the diff before anything touches a database
3. Review the generated .sql file
4. Commit the migration file along with the schema change
5. Deploy -- railpack.json / railway.toml now run `pnpm --filter @workspace/db run migrate` automatically before the server starts, applying any unapplied migrations

drizzle-kit push / push-force still exist in lib/db/package.json for fast local dev iteration only. Never run push against the production DATABASE_URL -- it bypasses migration history entirely.

Baseline migration (0000_mean_reptil.sql): this captures the full schema as it existed before migrations were introduced. It was marked as already-applied in production via lib/db/scripts/baseline-migration.mjs (one-time use -- do not re-run unless setting up a fresh environment that genuinely needs the baseline SQL executed).

Local DATABASE_URL: Railway's DATABASE_URL var points to postgres.railway.internal, only reachable from inside Railway's network. For any local drizzle-kit command (generate, migrate, etc.) against the real DB, use DATABASE_PUBLIC_URL instead:

DATABASE_URL="$(railway variables --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)" pnpm run migrate

## ALTER TYPE ADD VALUE split-file pattern (July 2026)

PostgreSQL's `ALTER TYPE ... ADD VALUE` has two separate constraints:
1. Cannot run inside a BEGIN/COMMIT transaction block (older PG versions).
2. Even in autocommit (no-transaction) mode, the new enum value is not visible
   to any subsequent statement in the SAME `client.query(sql)` call — PostgreSQL
   plans the entire query batch before executing and rejects the reference with
   error 55P04 "New enum values must be committed before they can be used."

The migration runner in run-migrations.mjs supports a `-- no-transaction` marker
that skips BEGIN/COMMIT for that file. But even with this, if the same file also
contains a CREATE INDEX or similar that references the new value, it fails.

**Rule**: Whenever a migration adds an enum value AND references it in the same
migration, split it into TWO files:
- File A (e.g. 0028_*): `-- no-transaction` marker + only the `ALTER TYPE ... ADD VALUE`
- File B (e.g. 0028b_*): normal transaction + the CREATE INDEX / constraint using the new value

File naming: `0028_` sorts before `0028b_` (underscore 0x5F < b 0x62), so the
runner applies them in the right order automatically.

See migrations 0028_business_governance.sql and 0028b_business_pending_idx.sql
as the canonical example of this pattern.
