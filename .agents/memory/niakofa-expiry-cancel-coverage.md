---
name: Request expiry nudges, cancel-reason forgiveness, coverage interest
description: Three related fixes from the July 2026 feedback pass — request expiry had no no-Redis fallback, helper cancel had no reason capture, and out-of-coverage requesters had no way to signal demand.
---

## Cleanup-worker had no no-Redis fallback
`cleanup-worker.ts`'s expiry logic (open-request expiry by urgency, orphaned-claim
recycling) only ran via a BullMQ repeatable job. In any environment without
`REDIS_URL` configured — which includes this dev environment — it silently never
ran at all. Fixed by extracting the core logic into `runCleanupCore()` and adding
`startCleanupWorkerLegacy()` (setInterval, 15 min cadence), wired into `index.ts`'s
no-Redis branch alongside the other legacy-fallback workers (pif-nudge, anomaly,
nia-checkin, daily-kindness). Also added a pre-expiry nudge push (halfway to the
urgency's expiry window, gated by `expiry_nudge_sent_at`) and an on-expiry push —
previously an expired request just silently vanished from the map with no
explanation to the requester.

**Why:** any new "runs periodically" worker in this codebase must ship BOTH a
BullMQ path and a legacy setInterval path, or it silently never runs in
Redis-less environments (this dev env included).

## Helper cancel-reason capture and no-show forgiveness
`POST /requests/:id/cancel` now accepts an optional `reason` in the body:
`traffic | safety | request_changed | other`. Stored on
`last_helper_cancel_reason` / `last_cancelled_by_helper_id`. The no_show_count
increment is skipped ONLY when `reason === "request_changed"` — that reason means
the requester altered the task/address out from under the helper after claim,
which is not a genuine drop. All other reasons (including no reason given) count
normally. Frontend (`request-active.tsx`) shows a reason picker only for the
helper-cancel path; requester withdraw still uses a plain confirm.

**Why:** no_show_count feeds trust-tier gating and is shown on public profiles —
penalizing a helper for a requester-side change would be unfair and was raised
directly in user feedback.

## Coverage interest ("notify me when my county activates")
New `coverage_interest` table (migration 0065) + `POST /api/coverage-interest`
(public, auth optional via the global `parseAuth` middleware — anonymous callers
must supply an email) + `GET /api/admin/coverage-interest` (admin-only demand
list). Wired into request-new.tsx's existing outside-coverage banner. Purely a
demand signal — no pool machinery reads this table.

**Why:** request-new.tsx already had a "no pool matched" empty state with no
action attached; map.tsx had no equivalent messaging at all despite reusing the
same geo-match-with-no-fallback pattern documented in
niakofa-community-match-no-fallback.md. Added a lightweight parallel
implementation in map.tsx (not a shared hook) to avoid refactoring
already-working request-new.tsx code under time pressure — if a third page ever
needs this logic, extract a shared hook at that point.
