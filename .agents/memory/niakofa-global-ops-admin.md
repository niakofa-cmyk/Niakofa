---
name: Niakofa Global Ops Admin Panel
description: GET /admin/global-ops endpoint + GlobalOpsSection admin UI — region bucketing, GPS health, language distribution, feature checks.
---

## Endpoint

`GET /api/admin/global-ops` — in `artifacts/api-server/src/routes/health.ts`.
Auth: `requireAuth` + `requireAdmin()` + `adminLimiter`.
Returns: GPS health (helpers with/without GPS), regions (helpers_online, open_requests, recent_completions), language_distribution (last 7 days), feature_checks (database, mapbox_token, nia_api_key, redis, push_vapid, workers_ok), summary.

## Region Bucketing — getRegion(lat, lng)

**CRITICAL: evaluation order matters because boxes overlap.**

Correct order:
1. Caribbean (lat 10–26, lng -86 to -58) — before N. America (same lng band)
2. Europe (lat 37–72, lng -10 to 40) — **BEFORE Africa** (Africa lat reaches 38, overlaps)
3. Middle East (lat 12–42, lng 34–65) — **BEFORE Africa** (Arabia/Levant/Iran overlap Africa box); lng starts at 34 so Egypt (lng ~31) stays in Africa
4. Africa (lat -35 to 38, lng -18 to 52)
5. North America (lat 7–72, lng -168 to -52)
6. South America (lat -56 to 12, lng -82 to -34)
7. Asia (lat -10 to 55, lng 60–145)
8. Oceania (lat -50 to -10, lng 110–180)
9. Other

**Why:** Checking Africa before Europe/Middle East caused Athens, Riyadh, Istanbul to be classified as Africa. Always check narrower/northern regions first.

**Verified boundary cities:**
- Athens GR (37.9N, 23.7E) → Europe ✓
- Riyadh SA (24.7N, 46.7E) → Middle East ✓
- Cairo EG (30.0N, 31.2E) → Africa (lng 31.2 < 34, misses ME box) ✓
- Nairobi KE (-1.3S, 36.8E) → Africa (lat -1 < 12, misses ME box) ✓
- Kingston JM (18.0N, -76.8W) → Caribbean ✓

## Admin UI

`GlobalOpsSection` component added to SystemTab (before DispatchSuggestSection).
- Auto-refreshes every 60s via `setInterval` in `useEffect` with cleanup.
- Shows: summary 3-stat grid, GPS signal health bar, regions table (emoji + helper/request/completion counts), language pills, feature verification checklist.
- `useCallback` wraps `load()` so `useEffect` dep array is stable.

## Dispatch Distance

`DispatchSuggestSection` now shows km or miles based on `detectUnits()` from locale-utils. Conversion: `distance_miles × 1.60934 = km`.

## How to apply

- Any future admin endpoint needing geographic bucketing: copy `getRegion()` from health.ts.
- When adding new regions, always check: does the new box's lat/lng range overlap an existing box? If so, check the more specific one first.
- `GlobalOpsSection` is the template for any future auto-refreshing admin panel section.
