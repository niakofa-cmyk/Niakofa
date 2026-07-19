---
name: Niakofa workflow bugs fixed July 19
description: Six concrete Helper+Requester workflow bugs found and fixed; E2E test patterns and API quirks.
---

# Niakofa workflow bugs fixed (July 19 2026)

## Six bugs fixed (commit 41860540)

### 1. Post-creation navigation (request-new.tsx)
`finishAndNavigate()` always navigated to `/`. Now accepts an optional `requestId` and routes to `/request/:id` so the requester lands directly on the tracking screen.  
`PendingPayment` interface gained `requestId: number`; all three Stripe modal callbacks (onSuccess/onSkip/onClose) thread it through.

### 2. Helper location broadcast (request-active.tsx)
No WS events were emitted by helpers. Added a `useEffect` that calls `wsSend({ type: "HELPER_MOVING", payload: { requestId, helperId, lat, lng, heading, speed } })` every 8 s while the helper is en route and not yet arrived/completed.  
**Why:** Requester's map couldn't show helper moving in real time — only REST polling (on request_updated), which is too slow and noisy.

### 3. Enhanced WS event handlers (request-active.tsx)
WS handler only reacted to `request_updated`. Now also handles:
- `REQUEST_ACCEPTED` → toast + SankofaBird accepted reaction (requester side)
- `HELPER_MOVING` → invalidate query (requester side, updates helper dot on map)
- `HELPER_ARRIVED` → toast + SankofaBird accepted reaction (requester side)

### 4. Claim confirmation (RequestCard.tsx)
Single tap immediately claimed. Now: first tap → amber "✓ Confirm Accept?" state with 4 s auto-reset; second tap claims. Emergency requests bypass confirmation (speed matters).  
`useState` + `useEffect` timeout cleanup pattern (standard — no external dep needed).

### 5. Pong-timeout reconnect (wsClient.ts)
No detection of zombie TCP connections (NAT timeouts, Wi-Fi handoffs). Added `pongTimer` (10 s) armed after each ping. Server pong clears it; if it fires, `socket.close()` triggers the exponential-backoff reconnect path.  
`PONG_TIMEOUT_MS = 10_000` constant added alongside existing `PING_INTERVAL_MS`.

### 6. Stripe Stripe modal navigation (request-new.tsx)
After Stripe payment, all three callbacks called `finishAndNavigate()` without an ID. Fixed to read `pendingPayment.requestId` before `setPendingPayment(null)` so they navigate to the created request.

## API quirks discovered during E2E testing

- **Urgency enum** is `low | medium | high | emergency` — NOT `normal`. Using `normal` returns a 422 Zod validation error.
- **Message create response** is `{ message: { id, ... } }` (wrapped) — not a flat `{ id, ... }`.
- **Griot story create response** is `{ story: { id, ... } }` (wrapped).
- **New users** start with `approval_status='pending'` and get 403 on request create until approved. In prod this is expected; for E2E testing, update the DB row to `approval_status='approved'` directly.
- **wsSend import** is from `@/lib/wsClient` — not a named hook.

## E2E test: 4/4 locations passed

All locations (Atlanta 33.749/-84.388, Accra 5.603/-0.187, Lagos 6.524/3.379, London 51.507/-0.128) passed the full lifecycle: create → nearby search → claim → bidirectional messaging → en-route → arrived → complete → rate (5 ★). Community story post (id=5) also succeeded.
