---
name: Niakofa Admin Coverage Doc
description: artifacts/ADMIN_COVERAGE.md is the canonical checklist of every admin API route vs. its admin panel UI location. Must be updated whenever a new admin route is added.
---

## Rule
Every time `requireAdmin()` appears on a new route in `artifacts/api-server/src/routes/`, a row MUST be added to `artifacts/ADMIN_COVERAGE.md` and the admin panel at `artifacts/pay-it-forward/src/pages/admin.tsx` must expose it.

**Why:** Admin panel drifted from the backend over ~20 routes in previous sessions. The coverage doc is the source of truth and the reconciliation mechanism.

**How to apply:**
1. After adding a new `requireAdmin()` route, open `artifacts/ADMIN_COVERAGE.md`.
2. Add a row with status `❌` (not yet in admin UI).
3. Implement the admin UI section and flip to `✅`.
4. Run `pnpm --filter @workspace/pay-it-forward typecheck` before marking complete.

## GPS table
The GPS/navigation health section in ADMIN_COVERAGE.md tracks:
- Coordinate privacy: fuzzed for public, full precision for requester/helper/admin
- Auto-arrival threshold: 80 m (Haversine)
- Off-route threshold: 150 m, 15 s cooldown (was 30 s before 2026-07-03 fix)
- Route cache: in-process Map, short TTL, acceptable to lose on restart
