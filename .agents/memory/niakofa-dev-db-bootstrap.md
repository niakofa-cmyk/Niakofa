---
name: Niakofa dev DB bootstrap
description: How to get a fresh Replit Postgres working for Niakofa dev
---

# Dev DB Bootstrap

## The rule
1. Replit's PostgreSQL is always pre-provisioned — DATABASE_URL is injected automatically at runtime. No create step needed.
2. Run migrations: `pnpm --filter @workspace/db run migrate` — applies all 46 migration files in order, handles fresh DB (no users table) via baseline detection.
3. Seed system settings: pool_enabled=true, pool_guaranteed_minimum=5, pool_minimum_hourly_rate=15, pool_low_balance_threshold=25, nia_enabled=false, businesses_enabled=true — some are seeded by migrations, some need manual INSERT ON CONFLICT DO NOTHING.
4. Seed test accounts: admin@niakofa.app / NiakofaAdmin2026!, helper@niakofa.app / NiakofaHelper2026!, user@niakofa.app / NiakofaUser2026!

## Key columns on users table (schema as of migration 0046)
- No `is_active` column — use `is_suspended=false` for active users
- No `tos_accepted` column — ToS acceptance is tracked in `tos_waiver_accepted_at` + `tos_waiver_version`
- `approval_status` defaults to 'pending'; individual accounts auto-approve; others need admin review

## Why
nia_enabled=false must be in DB (not just code) so the admin UI toggle persists. Migration 0018 seeds it. The nia-service also has its own migrate.sql (for push_notification_queue, nia_knowledge, nia_cost_log) called via runMigrations() at boot — those 3 tables are NOT in the main Drizzle pipeline.
