---
name: Niakofa state-sync fixes (July 2026)
description: Core fixes for data disappearing/disagreeing on page refresh — AppContext, map, voice.
---

## The two root-cause gaps that caused "data disagreeing on refresh"

### 1. Helper mode — already had rollback; dynamic toast import was fragile
`AppContext.tsx` used `import("../hooks/use-toast").then(...)` (dynamic) in the
rollback onError handler. Replaced with a static `import { toast }` at the top
so the toast is always available.

### 2. Active-request ghost after app-closed changes — startup check existed; live WS did not
On startup, AppContext already validated the stored `activeRequestId` via
`GET /api/requests/:storedReqId`. **What was missing**: a live WS subscription
to clear it _while the app is open_. Added a `wsSubscribe` useEffect that
watches `REQUEST_COMPLETED` and `REQUEST_CANCELLED` and clears `activeRequestId`
immediately (using `setActiveRequestIdState` setState-callback pattern to avoid
stale closure). Both paths now show a toast so the user knows why the job cleared.

**Why:** setState callback avoids stale closure on `activeRequestId` — correct
pattern is `setActiveRequestIdState(prev => { if (prev !== eventId) return prev; ... return null; })`

### 3. map.tsx — REQUEST_CANCELLED missing from WS handler
The WS event handler in map.tsx included `REQUEST_COMPLETED` but not
`REQUEST_CANCELLED` — cancelled requests stayed on the map until the next
poll. Added `REQUEST_CANCELLED` to the handler condition.

### 4. Voice wake word / story recording — `rec.lang = ""`
`voiceWakeWord.ts` set `rec.lang = ""` on the SpeechRecognition instance (both
VAD and fallback paths) — an empty string falls back to OS locale and can silently
filter non-English wake words. Changed to `navigator.language || "en-US"`.
`useNiaStory.ts` had hardcoded `"en-US"` — changed to `detectVoiceLocale()` from
locale-utils.ts so story recordings work in the user's actual language.

## How to apply on a fresh Replit import
1. `pnpm install`
2. `pnpm --filter @workspace/db run migrate`
3. `pnpm --filter @workspace/scripts run seed-if-empty`
4. Workflows: Frontend on PORT=5000, API Server on PORT=8080
