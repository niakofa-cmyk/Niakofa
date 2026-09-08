# Admin 2.0 Audit + Hardening

## Scope

This pass treats Admin as an operations console rather than a collection of unrelated tabs.

### Current architecture audited

- Server authorization remains authoritative through `requireAuth()` + `requireAdmin()` and the admin rate limiter.
- The existing Admin screen already has grouped navigation: Trust & Safety, Finance, Intelligence, Configure.
- The existing live banner and selected tabs use live API data; some legacy tabs still refresh on mount/tab entry.
- Production uses the same API service for the application and Admin, so Admin observations are tied to live application state rather than a separate mock data plane.

## Admin 2.0 workflow

1. **Attention** — surface money, worker, moderation, and geography risks before routine configuration.
2. **People** — review users, helpers, organizations, and approvals.
3. **Community** — inspect live community activity and neighborhood geography.
4. **Money** — monitor pool health, settlements, cashouts, and hardship queues.
5. **Intelligence** — manage Nia state, usage, and audit history.
6. **System** — inspect Redis/workers, feature checks, GPS coverage, and production connectivity.

## New operations dashboard

`admin-operations.tsx` provides a live API-backed operations surface using existing protected endpoints:

- `/api/admin/stats`
- `/api/pool/stats`
- `/api/admin/worker-health`
- `/api/admin/global-ops`
- `/api/admin/neighborhood-boundary-imports`
- `/api/admin/nia-status`

It refreshes every 30 seconds, keeps the previous snapshot visible during background refresh, and reports the timestamp of the latest snapshot.

## Geography safety

The geography console deliberately keeps staged GIS separate from GPS-active production neighborhood data.

The intended sequence is:

`authoritative source → staged import → PostGIS validation → human review → explicit geometry verification → explicit promotion → GPS Host Signal`

Generated neighborhood hints are never eligible for GPS verification or promotion.

Promotion requires an explicit confirmation because it changes the boundary that can authorize the green GPS neighborhood Host Signal.

## Money safety

The dashboard highlights the Community Pool when its live balance is below the configured guaranteed-minimum threshold. It does not fabricate a funding state or silently mutate the pool.

Financial actions remain behind the existing server-side endpoints and should retain explicit confirmation/audit behavior.

## Production findings

At the time of this audit, Railway production was healthy. The API service was successfully serving health/readiness checks, WebSocket traffic, and authenticated Admin requests. Redis/Postgres/PostGIS were healthy.

A real production warning remains: the Community Pool balance is below its configured alert threshold. This is an operational condition, not a frontend defect.

## Follow-up integration

The existing `/admin` screen remains the canonical multi-tab Admin surface. This dashboard is intentionally isolated in the first hardening commit so the large legacy `admin.tsx` file is not rewritten wholesale without browser acceptance coverage. The next integration step should mount this dashboard as the Admin landing/Attention surface, then retain the existing tabs as drill-down workflows.

No neighborhood boundaries are auto-verified or auto-promoted by this pass.
