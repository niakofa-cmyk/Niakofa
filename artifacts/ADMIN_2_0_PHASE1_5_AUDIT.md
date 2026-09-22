# Admin 2.0 — Phase 1–5 Audit & Hardening

## Scope

This document is the operating contract for the Admin 2.0 audit. It separates static inventory, functional safety, UX structure, browser acceptance, and production verification so a passing build is not mistaken for a passing operational console.

## Phase 1 — Inventory

### Admin surfaces

- `/admin` — legacy full console; grouped Trust & Safety, Finance, Intelligence, Configure workflows.
- `/admin/operations` — Admin 2.0 attention-first operational console.
- `/admin/analytics` — analytics surface without end-user navigation chrome.

### API inventory

`artifacts/ADMIN_COVERAGE.md` remains the route-level source of truth. The new `audit:admin` contract scans every API route file for `requireAdmin()` usage and verifies the core Admin 2.0 surfaces and safety contracts remain represented.

### Data classification

**Live / periodically refreshed:** Operations stats, pool status, worker health, global operations/GPS health, boundary staging inventory, Nia status, pending queues.

**Snapshot / tab-load:** The legacy console's slower-changing tables and dashboards remain mount/tab driven. They are not falsely labeled realtime.

**Realtime:** WebSocket-backed application presence remains separate from Admin polling; Admin should surface health/last-updated state rather than fabricate realtime semantics.

### Orphan/duplicate control policy

- Every protected admin endpoint must be represented in `ADMIN_COVERAGE.md`.
- Internal or user-level endpoints may be marked N/A when there is a documented reason.
- The same destructive action must not be exposed twice with conflicting semantics.
- Neighborhood verification and promotion remain separate actions.

## Phase 2 — Functional audit

| Area | Contract |
|---|---|
| GET | Loading, empty, error, stale/last-updated state |
| POST/PATCH/DELETE | Explicit action state, server error surfaced, refresh after success |
| Authorization | Server `requireAuth()` + `requireAdmin()` is authoritative; UI gate is convenience only |
| Rate limiting | Admin mutation routes retain the admin rate limiter policy |
| Audit logging | Moderation/suspension and other consequential server mutations remain audit-tracked where their existing route contract requires it |
| Confirmation | Destructive or irreversible actions require an explicit confirmation step |
| Geography | Review → Geometry Verify → Explicit Promote; no automatic GPS activation |
| Generated geography | `generated_hint` / generated authority is never eligible for GPS verification or promotion |

## Phase 3 — Admin 2.0 layout

Operational navigation is organized around:

1. **Attention** — pending approvals, moderation, hardship, reports, pool risk, worker failures, invalid geography.
2. **People** — users, helpers, applications, organizations/sponsors.
3. **Community** — Diaspora Hubs, neighborhoods, Spirals, civic resources.
4. **Money** — Community Pool, pledges, settlements, cashouts and reconciliation.
5. **Intelligence** — Nia status, cost, memory and AI operations.
6. **System** — workers, infrastructure, audit/configuration and geography controls.

`/admin/operations` is the safe attention-first entry point while `/admin` remains the compatibility console. This avoids a risky replacement of the established multi-tab surface in the same change set.

## Phase 4 — End-to-end acceptance

`e2e/admin-2-0-live.spec.ts` is an opt-in authenticated browser contract. It requires:

- `ADMIN_E2E_BASE_URL`
- `ADMIN_E2E_STORAGE_STATE`

It verifies:

- Admin Operations loads for an authenticated admin.
- User-facing navigation chrome is absent from the operations surface.
- Attention, pool, workers, and Nia/connectivity sections render.
- Review/verify/promote safety language remains visible.
- Full Admin navigation returns to `/admin`.

The suite intentionally does not invent credentials or mutate production data. It can be run against a controlled acceptance account using Playwright storage state.

## Phase 5 — Production verification

Production verification is split into two gates:

### Automated gate

- GitHub CI: App/AI boundary, ESLint, typecheck/tests, release validation.
- `pnpm run verify:platform` includes the Admin inventory contract.
- `pnpm run test:admin-live` is the authenticated browser acceptance command.

### Human production acceptance

1. Sign in as an admin and open `/admin/operations`.
2. Confirm the last-updated timestamp changes after refresh.
3. Confirm Attention reflects live pending queues and pool state.
4. Confirm a real user visible in the application is represented by the Admin user/account APIs.
5. Perform one controlled moderation action in a non-production/destructive test account and verify the application state changes and audit record is present.
6. Review staged Fort Worth/Kansas City boundaries.
7. Never promote invalid geometry, including the known Parkdale And Walden invalid feature until its source geometry is corrected and independently revalidated.
8. Verify WebSocket health separately from Admin polling; reconnects should be visible as health transitions, not hidden as successful stale data.

## Railway verification

Do not deploy an unmerged branch. After CI is green and the PR is merged, verify the resulting Railway deployment and production health endpoints before declaring Phase 5 complete.

## Safety principle

Admin UI is an operator console, not an authorization boundary. The server remains authoritative for identity, admin access, rate limits, auditability, and geography promotion. No Admin 2.0 convenience feature may bypass those gates.
