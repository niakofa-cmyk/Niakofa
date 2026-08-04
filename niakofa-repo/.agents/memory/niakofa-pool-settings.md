---
name: Niakofa pool system settings
description: All system_settings keys related to community pool, their defaults, and which migrations seed them
---

# Pool system_settings

| Key | Default | Seeded in migration |
|-----|---------|---------------------|
| `pool_enabled` | `true` | 0024 |
| `pool_guaranteed_minimum` | `5` (dollars) | 0024 |
| `pool_low_balance_threshold` | `25` (dollars) | 0025 |
| `pool_minimum_hourly_rate` | `15` (dollars/hr) | 0048 |
| `nia_enabled` | `false` | 0018 |
| `businesses_enabled` | `true` | (earlier) |

**Why:** `getHourlyMinimumRate()` defaults to $15/hr in code if the DB row is missing, so existing deployments always work. Migration 0048 seeds the row so admins can tune it without a code deploy.

**How to apply:** When adding a new tunable setting, always: 1) code a safe default in the lib function, 2) seed it in a migration with ON CONFLICT DO NOTHING, 3) add a row to this table.
