# Niakofa Admin Panel — Route Coverage Tracker

**Purpose:** Every time a new admin-level API route is added to `artifacts/api-server/src/routes/`, a corresponding row MUST be added here and the admin panel at `artifacts/pay-it-forward/src/pages/admin.tsx` MUST be updated to expose it. This file is the authoritative living checklist.

> **Enforcement:** Before merging any PR that touches `routes/`, verify this file is updated. If a route has no admin UI and is not explicitly marked `N/A (internal)`, it's a gap.

---

## Coverage Map

| Route | Method | Admin UI Location | Status |
|---|---|---|---|
| `/admin/analytics` | GET | AnalyticsTab — platform KPI grid | ✅ |
| `/admin/accounts` | GET | UsersTab — user list + search | ✅ |
| `/admin/accounts/:id/approval` | PATCH | UsersTab via PendingAccountsCard | ✅ |
| `/admin/helper-applications` | GET | HelpersTab via BackgroundCheckAdmin | ✅ |
| `/admin/users/:id/suspend` | POST | SystemTab / UsersTab bulk suspend | ✅ |
| `/admin/users/:id/unsuspend` | POST | AuditLogTable / manual | ✅ |
| `/admin/suspended` | GET | AuditLogTable synthesised data | ✅ |
| `/admin/nia-status` | GET | NiaTab — Nia AI on/off toggle | ✅ |
| `/admin/nia-toggle` | POST | NiaTab — toggle button | ✅ |
| `/admin/nia-costs` | GET | NiaTab — Cost Dashboard (7d) | ✅ |
| `/admin/nia-cost-alert` | GET | NiaTab — Daily Cost Alert banner | ✅ |
| `/admin/nia-memory-stats` | GET | NiaTab — Memory Users + Entries tiles | ✅ |
| `/admin/stats` | GET | AnalyticsTab — KPI tiles | ✅ |
| `/admin/pool-settings` | GET | SettingsTab — guaranteed minimum / hourly rate | ✅ |
| `/admin/pool-settings` | PATCH | SettingsTab — save pool settings | ✅ |
| `/admin/bootstrap` | POST | SettingsTab — Bootstrap Admin section | ✅ |
| `/admin/verify-secret` | POST | SettingsTab — Bootstrap Admin section | ✅ |
| `/admin/businesses` | GET | OrgsTab — business review queue | ✅ |
| `/admin/businesses/:id/approve` | PATCH | OrgsTab — Approve/Reject business | ✅ |
| `/admin/civic-suggestions` | GET | SettingsTab → CivicSuggestionsSection | ✅ |
| `/admin/civic-suggestions/:id` | PATCH | SettingsTab → CivicSuggestionsSection | ✅ |
| `/admin/city-neighborhoods` | GET | SystemTab → NeighborhoodsSection | ✅ |
| `/admin/city-neighborhoods/:id` | PATCH | SystemTab → NeighborhoodsSection (verify) | ✅ |
| `/admin/city-neighborhoods/:id` | DELETE | SystemTab → NeighborhoodsSection (delete) | ✅ |
| `/crisis/status` | GET | SettingsTab → CrisisModeSection | ✅ |
| `/crisis/activate` | POST | SettingsTab → CrisisModeSection | ✅ |
| `/crisis/deactivate` | POST | SettingsTab → CrisisModeSection | ✅ |
| `/admin/moderation-queue` | GET | ReportsTab → PostModerationSection | ✅ |
| `/admin/moderation-queue/:id/decide` | POST | ReportsTab → PostModerationSection | ✅ |
| `/admin/requests/flagged` | GET | ReportsTab → FlaggedRequestsSection | ✅ |
| `/admin/requests/:id/moderate` | POST | ReportsTab → FlaggedRequestsSection | ✅ |
| `/admin/requests/:id/pledge-status` | PATCH | SystemTab → Hardship Queue (Forgive / Write Off) | ✅ |
| `/admin/requests/:id/hardship` | DELETE | SystemTab → Hardship Queue (Dismiss) | ✅ |
| `/admin/hardship-requests` | GET | SystemTab → Hardship Queue | ✅ |
| `/admin/region-crisis-resources` | GET | SystemTab → RegionCrisisSection | ✅ |
| `/admin/region-crisis-resources/:id` | PATCH | SystemTab → RegionCrisisSection (verify) | ✅ |
| `/admin/region-crisis-resources/:id` | DELETE | SystemTab → RegionCrisisSection (delete) | ✅ |
| `/admin/region-crisis-resources/:id/suggest` | POST | N/A (internal — seeded by AI dispatch, not human UI) | ⚪ |
| `/admin/cashouts` | GET | SystemTab → CashoutSection | ✅ |
| `/admin/worker-health` | GET | SystemTab → Worker Health | ✅ |
| `/reports` | GET | ReportsTab → UserReportsSection | ✅ |
| `/reports/:id` | GET | ReportsTab → ReportDetailSheet | ✅ |
| `/reports/:id/review` | PATCH | ReportsTab → ReportDetailSheet | ✅ |
| `/users/:id/reports` | GET | N/A (per-user; embedded in ReportDetailSheet context) | ⚪ |
| `/users/:id/moderation` | PATCH | UsersTab → action sheet (warn / ban) | ✅ |
| `/users/:id` | DELETE | UsersTab → action sheet (Hard Delete, destructive) | ✅ |
| `/users` | GET | UsersTab — full user list | ✅ |
| `/admin/users/:id/background-check` | POST | HelpersTab via BackgroundCheckAdmin | ✅ |
| `/leaderboard/recalculate` | POST | AnalyticsTab → Recalculate Leaderboard button | ✅ |
| `/helpers/auto-assign/:requestId` | POST | SystemTab → Smart Dispatch Suggest panel (advisory, read-only) | ✅ |
| `/gov-sponsors` | POST | N/A (user-level self-signup) | ⚪ |
| `/admin/gov-sponsors` | GET | OrgsTab — gov sponsor queue | ✅ |
| `/admin/gov-sponsors/:id/approve` | PATCH | OrgsTab — Approve/Reject sponsor | ✅ |
| `/gov-sponsors/:id/fund` | POST | OrgsTab — Fund pool button | ✅ |

---

## Key: Status Codes

- ✅ **Covered** — fully wired in the admin UI
- ⚠️ **Partial** — endpoint exists, admin UI is read-only or only partially exposed
- ❌ **Gap** — admin route with no UI; action required
- ⚪ **N/A** — internal/webhook/user-level; no admin UI needed

---

## GPS & Navigation Health

| Feature | Implementation | Status |
|---|---|---|
| Location broadcast | `watchPosition` EMA-smoothed, 2s/15s/30s intervals | ✅ |
| Nearby requests | ~100 m fuzz applied to unassigned request coords | ✅ |
| Request detail coords | Full precision only for requester/assigned helper/admin | ✅ (fixed 2026-07-03) |
| Turn-by-turn navigation | Mapbox Directions + NavigationOverlay + TurnArrowHUD | ✅ |
| Voice guidance | Web Speech API, helper-only, per-step + arrival + off-route | ✅ |
| Auto-arrival | Haversine check at 80 m threshold | ✅ |
| Off-route detection | Projected Euclidean at 150 m, 15 s cooldown | ✅ (cooldown reduced 2026-07-03) |
| Route cache | In-process Map (3 min driving, 10 min walking) | ⚠️ Lost on restart — acceptable (short TTL) |
| Rerouting | `queryClient.invalidateQueries` on off-route trigger | ✅ |

---

## How to Keep This Updated

When adding a new API route to any `artifacts/api-server/src/routes/*.ts` file:

1. If the route has `requireAdmin()` middleware → **mandatory**: add a row to the Coverage Map above with status ❌, then implement the admin UI and change to ✅.
2. If the route is user-level only (no `requireAdmin()`) → check whether admins still need visibility (e.g., for oversight). If yes, add a row with ⚠️ or ✅; if no, add ⚪.
3. Update the GPS table if navigation or location behavior changes.
4. Run `pnpm --filter @workspace/pay-it-forward typecheck` and `pnpm --filter @workspace/api-server typecheck` before marking complete.
