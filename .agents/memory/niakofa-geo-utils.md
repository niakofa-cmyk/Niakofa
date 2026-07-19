---
name: Niakofa geo-utils shared proximity math
description: haversineMeters, haversineDistanceMiles, isNearbyUser, and NEARBY_USER_METERS all live in lib/geo-utils.ts — single source of truth for both map.tsx and request-active.tsx.
---

## Rule
All haversine / proximity math lives in `artifacts/pay-it-forward/src/lib/geo-utils.ts`.
Never add a new inline haversine implementation to a page component.

## Why
map.tsx originally used miles internally (`200 / 1609.34`); request-active.tsx used
meters (`< 200`). Two separate approaches to the same 200 m wing-salute threshold —
a precision change or bug fix in one would not propagate to the other.

## How to apply
- Import `haversineMeters`, `haversineDistanceMiles`, `isNearbyUser`, `NEARBY_USER_METERS`
  from `@/lib/geo-utils`.
- To change the wing-salute threshold, change `NEARBY_USER_METERS` in geo-utils.ts only.
- Tests live at `src/lib/__tests__/geo-utils.test.ts` (26 tests, all pass).
- The test script in `package.json` already includes geo-utils.test.ts.
