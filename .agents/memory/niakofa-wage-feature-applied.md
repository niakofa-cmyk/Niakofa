---
name: Niakofa wage feature applied
description: Per-county livable-wage floor feature merged from wage-feature zip; DB migration for hourly_rate column is 0051; communities.ts is now async (getHourlyMinimumRate call); helper-dashboard shows wage card.
---

# Per-county wage floor feature

**Rule:** When editing communities routes or community pool logic, the `buildCommunityStats` function in `artifacts/api-server/src/routes/communities.ts` is now `async` and calls `getHourlyMinimumRate(community.id)` — keep it async.

**Why:** Migration 0051 added `hourly_rate real` column to communities table. `getHourlyMinimumRate(countyId)` in community-pool.ts checks this column first, then falls back to the global `pool_minimum_hourly_rate` system setting. Exposed as `minimum_hourly_rate` and `hourly_rate_is_county_override` in the GET /communities/:id response.

**How to apply:** Admin community form in `admin.tsx` has a "Livable Wage Floor ($/hr)" input. Helper dashboard in `helper-dashboard.tsx` shows a "Your Guaranteed Wage" card fetching /api/communities/:id. The `daily-kindness-worker.ts` filters helpers by `helper_mode_active` column (not `active`).
