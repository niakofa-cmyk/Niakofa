---
name: Niakofa Legacy Recovery Checks
description: RECOVERY_CHECKs coverage in run-migrations.mjs for the Legacy Engine migration era (0092-0104).
---

# Niakofa Legacy — Migration Recovery Check Coverage

## Rule
Every time a new legacy migration is added, add a RECOVERY_CHECK for its sentinel table/column. Checks use `to_regclass()` (returns NULL, never throws) — safe on fresh DBs.

## Current coverage (as of Aug 4 2026)

| Migration | Sentinel | Added |
|---|---|---|
| 0018 | system_settings table | Original |
| 0019 | report_type 'sos' enum | Original |
| 0020 | help_requests FK | Original |
| 0021 | users.password_reset_code | Original |
| 0093 | family_knowledge_versions integer PK | Aug 4 prev session |
| 0093 | legacy_worlds table | Aug 4 prev session |
| 0093 | family_places table | Aug 4 prev session |
| 0093 | family_events table | Aug 4 prev session |
| 0094 | family_members.is_living column | Aug 4 this session |
| 0095 | family_members.updated_at column | Aug 4 this session |
| 0096 | legacy_place_discoveries table | Aug 4 this session |
| 0098 | legacy_seasonal_events table | Aug 4 this session |
| 0098 | legacy_game_master_narrations table | Aug 4 this session |
| 0098 | legacy_world_evolution_log table | Aug 4 this session |
| 0099 | legacy_family_challenges table | Aug 4 this session |
| 0099 | legacy_challenge_contributions table | Aug 4 this session |
| 0100 | legacy_quest_progress table | Aug 4 this session |
| 0101 | legacy_memory_mysteries table | Aug 4 this session |
| 0101 | legacy_ai_director_missions table | Aug 4 this session |
| 0101 | legacy_character_evolution table | Aug 4 this session |
| 0102 | legacy_scenes table | Aug 4 prev session |
| 0103 | legacy_quests table | Aug 4 prev session |
| 0104 | idx_legacy_memory_mysteries_family_status index | Aug 4 prev session |

**Why:** On the live Railway DB, migrations in the 0092-0104 era are at risk of being baseline-marked without executing (old BASELINE_CUTOFF behavior) or recorded as applied after a partial run. Without recovery checks, the next deploy silently skips re-running the file, leaving Phase 5 routes (AI Director, Memory Mysteries, Character Evolution, Seasonal Events, World Evolution, Challenges, Quest Progress, GPS check-in) to 500 at runtime.

**How to apply:** After adding any new migration file `NNNN_*.sql`, add a RECOVERY_CHECK entry to `lib/db/scripts/run-migrations.mjs` in the `RECOVERY_CHECKS` array. Use `to_regclass('public.table_name') IS NOT NULL AS exists` for tables, or `information_schema.columns` for columns.
