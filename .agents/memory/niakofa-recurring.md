---
name: Niakofa recurring requests
description: Architecture of the recurring help request subscription feature — table, routes, scheduler, frontend page.
---

# Recurring Requests

**Rule:** The recurring request system has three layers that must all be consistent:
1. DB: `recurring_requests` table in `lib/db/src/schema/recurring-requests.ts`
2. API: `artifacts/api-server/src/routes/recurring.ts` — CRUD routes + `processRecurringRequests()` worker export
3. Scheduler: `artifacts/api-server/src/lib/scheduler.ts` — `startRecurringRequestWorker()` runs every hour, calls `processRecurringRequests()`

**Why:** The scheduler imports `processRecurringRequests` from the routes file to avoid circular deps. The worker fires in `artifacts/api-server/src/index.ts` alongside the payment reminder worker — always runs regardless of Redis.

**How to apply:** When adding new scheduled behavior, follow this same pattern: export a `processX()` function from the route file, import it in scheduler.ts, wrap in a `startXWorker()` export, and call it in index.ts.

**Frontend:** `/recurring` page at `artifacts/pay-it-forward/src/pages/recurring.tsx`. Entry point is the "Recurring" button in the wallet action grid (wallet.tsx). Route added to App.tsx.

**Key gotcha:** `requireAdmin()` in authz.ts is a factory — must call it as `requireAdmin()`, not pass it directly as middleware. Same pattern as `requireOwnership(paramName)`.
