---
name: Niakofa Nia AI audit fixes
description: Comprehensive Nia end-to-end audit fixes — bugs, wiring gaps, and enhancements applied July 2026.
---

## Critical bugs fixed

- **checkin.ts ON CONFLICT crash**: `nia_conversations` has no UNIQUE constraint on `(user_id, session_id)` and no `updated_at` column. Removed the ON CONFLICT clause; replaced with plain INSERT. (`artifacts/nia-service/src/routes/checkin.ts`)

- **Memory routes bypass kill-switch**: `GET /api/nia/memory` and `DELETE /api/nia/memory` in nia-proxy.ts had no `isNiaEnabled()` check. Added fail-closed check to both. (`artifacts/api-server/src/routes/nia-proxy.ts`)

- **nia-context no rate limiter**: `GET /nia/context` was open to DB hammering on every chat open. Added `generalApiLimiter`. (`artifacts/api-server/src/routes/nia-context.ts`)

## WS event wiring (NiaDrawer.tsx)

- **nia_typing**: backend fires `nia_typing {status:"started"}` before SSE stream and `{status:"stopped"}` after. NiaDrawer now subscribes and shows an animated "Nia is thinking…" indicator (NiaOrb + italic label) when started and loading=false.
- **nia_status**: backend fires on upstream errors. NiaDrawer shows a red banner "Nia is having trouble connecting — she'll be back shortly." Auto-clears after 12 seconds.
- **nia_checkin**: proactive check-in/follow-up messages now appear directly in the chat history when the drawer is open.
- **nia_memory_update**: clears the niaOffline flag on any positive signal.
- Import: `wsSubscribe` added to NiaDrawer.tsx imports.

## Continuous learning enhancements

- Added 2 global topics to `buildLearningTopics()`: `global_emergency_resources` and `mutual_aid_best_practices` (was previously 100% Fort Worth / Tarrant County specific).
- Added `triggerLearningCycle()` export — allows admin to force-refresh Nia's knowledge immediately without waiting 6h.

## Admin knowledge-refresh endpoint

- New route: `POST /api/nia/knowledge-refresh` (admin auth + adminLimiter). Forwards to nia-service `/knowledge-refresh`.
- New nia-service route: `artifacts/nia-service/src/routes/knowledge-refresh.ts` — calls `triggerLearningCycle()`, requires x-internal-secret.
- Mounted in `artifacts/nia-service/src/index.ts`.
- 10-minute timeout (full cycle ~5 min = 7 topics × 30s gap).

## Ambient presence worker

- Food signal message now says "You can text or call 211…" generically, then "In Tarrant County: Tarrant Area Food Bank 817-857-7100" as a specific example — better for global users.

## Architecture notes

- `requireAdmin()` is a middleware factory (returns middleware) — call as `requireAdmin()` not `await requireAdmin(req, res)`.
- nia_conversations has NO unique constraint on (user_id, session_id) and NO updated_at column — never use ON CONFLICT on those columns.
- nia_typing WS event fires from api-server's nia-proxy (NOT from nia-service directly) — before and after the SSE stream.
