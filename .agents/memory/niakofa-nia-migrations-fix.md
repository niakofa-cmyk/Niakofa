---
name: Niakofa nia-service startup migrations
description: runMigrations() was dead code — must be called at boot to create nia_knowledge, push_notification_queue, nia_cost_log
---

# Nia-service Startup Migrations Must Be Called

## The rule
`runMigrations()` in `artifacts/nia-service/src/lib/db.ts` MUST be called at the top of `artifacts/nia-service/src/index.ts`, before `app.listen()`, wrapped in try/catch.

## Why
Three tables exist ONLY in `artifacts/nia-service/migrate.sql` and are NOT in the main Drizzle pipeline:
- `nia_knowledge` — continuous-learning-worker's persistence store
- `push_notification_queue` — ambient-presence and general-checkin workers write here; api-server drains it
- `nia_cost_log` — Anthropic API cost tracking

Without calling `runMigrations()`, these tables never exist in production. Confirmed by Postgres logs showing `push_notification_queue` erroring on every 5-minute poll cycle since first deploy.

Three tables ARE also in the Drizzle pipeline and are unaffected:
- `nia_conversations` — Nia chat history (works without this fix)
- `nia_memories` — Nia memory (works without this fix)
- `system_settings` — Nia kill-switch (works without this fix)

## How to apply
The fix is a top-level `await runMigrations()` in the ESM module (type: "module" in nia-service package.json supports top-level await). Must stay wrapped in try/catch — non-fatal since core chat doesn't depend on these three tables.
