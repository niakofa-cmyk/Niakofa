-- Migration 0023: help_requests.photo_url
--
-- lib/db/src/schema/requests.ts has had `photo_url: text("photo_url")` on
-- requestsTable for a while, with a comment claiming it was added in
-- "migration 0015" — but 0015_is_suspended.sql is actually about
-- users.is_suspended, unrelated. No migration ever added this column to
-- help_requests. Confirmed missing on the live DB via production logs:
-- pledge-worker's daily reconciliation job (artifacts/api-server/src/workers/
-- pledge-worker.ts) was crashing every run with
-- 'column "photo_url" does not exist' because its SELECT (via Drizzle,
-- which selects all schema-declared columns) included a column that only
-- existed in TypeScript, not in Postgres.
--
-- This drift went undetected because the "migrate" step (drizzle-kit push)
-- was silently failing on every deploy — see CLAUDE.md Incident #28 and
-- lib/db/scripts/run-migrations.mjs, which replaces it.

ALTER TABLE "help_requests" ADD COLUMN IF NOT EXISTS "photo_url" text;
