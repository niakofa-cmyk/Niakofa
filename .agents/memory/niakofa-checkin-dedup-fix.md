---
name: Niakofa check-in dedup + crisis follow-up
description: Removed duplicate 24h check-in scheduler; added real is_crisis tracking and the actual Phase 2 crisis follow-up worker
---

## Duplicate check-in scheduler (fixed)
- `artifacts/nia-service/src/workers/checkin-worker.ts` (and its
  `startCheckinWorker()` call in nia-service's `index.ts`) **deleted**.
- `artifacts/api-server/src/workers/nia-checkin-worker.ts` is now the single
  scheduler: queries `help_requests` for completed-23-25h-ago rows where
  `nia_checkin_sent_at IS NULL`, calls nia-service's `POST /checkin` (secured
  via `x-internal-secret` header) to generate Nia's message, marks the column.
- `help_requests.nia_checkin_sent_at` added in migration
  `0013_checkin_and_crisis_flag.sql` — it didn't exist before, so the worker
  was throwing on every run prior to this fix.

## is_crisis tracking (new)
- `nia_conversations.is_crisis BOOLEAN NOT NULL DEFAULT FALSE`, same migration.
- Set at save-time in `nia-service/src/routes/chat.ts`'s hard-escalation path
  (`saveConversation(..., true)` when `checkSafety()` returns `flagged: true`).
- `getCrisisConversationsForFollowup()` in `nia-service/src/lib/db.ts` now
  queries this real column instead of `LIKE '%988%'`/`LIKE '%crisis%'` text
  matching against `nia_response`.

## Crisis follow-up worker (new, real Phase 2)
- `artifacts/nia-service/src/workers/crisis-followup-worker.ts` —
  `startCrisisFollowupWorker()`, the ONLY scheduler for this, started in
  nia-service's `index.ts` (offset 15-min startup delay, hourly thereafter).
- Looks for crisis-flagged conversations 48–72h old with no reply since and
  no prior `[crisis-followup:...]` tag, via `getCrisisConversationsForFollowup()`.
- Prompt is deliberately non-clinical — never says "crisis," "988," or any
  hotline name; framed as a neighbor quietly checking in, not a case follow-up.
- **Gotcha caught while building this**: `purgeExpiredConversations()`
  deleted everything older than 48h, which would have deleted every
  crisis-flagged row before the 48-72h follow-up window ever got to query it.
  Fixed: `is_crisis = TRUE` rows now survive to 96h before purge; normal rows
  still purge at 48h.

## Phase 4 — trust-aware match explanations (wired, unexercised in prod)
- `helper-dashboard.tsx`: new `useEffect` (before any early return — hooks
  ordering) surfaces currently-visible open requests' `match_reasons` into
  `AppContext.lastViewedMatchReasons`, attributed by request title.
- `App.tsx`'s `NiaWrapper` passes it to `NiaDrawer` as `matchReasons` prop.
- `NiaDrawer.tsx` merges it into the `liveContext.matchReasons` field sent to
  `/api/nia/chat`.
- `nia-service/src/routes/chat.ts`'s `buildLiveContextPrefix()` renders it
  with an explicit instruction: only use these real reasons if asked why a
  helper was matched, never invent one.
- Not yet verified end-to-end against a live deploy — code-reviewed only.
