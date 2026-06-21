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
