---
name: Niakofa WS relay and broadcast scoping
description: How HELPER_MOVING relay works end-to-end; why lifecycle broadcasts use sendToRequestParticipants + broadcast instead of broadcastRequestEvent.
---

# Niakofa WS relay and broadcast scoping

## HELPER_MOVING end-to-end flow

The helper sends real-time GPS via WS (not HTTP POST) every 8 s from `request-active.tsx`.
The server in `ws-hub.ts` validates the sender is the assigned helper (DB WHERE helper_id = senderId)
then relays only to the requester via `sendToUser`. No REST endpoint involved.

Key properties:
- Best-effort: if WS is reconnecting, ticks are dropped (acceptable — resumes in < 15 s)
- Ephemeral: position is NOT stored anywhere on the server
- Requester renders a pulsing teal Marker via `helperLocation` state (cleared on arrived/completed/ws_reconnected)

## Lifecycle broadcast scoping (post-July-19 fix)

`broadcastRequestEvent(type, legacyType, payload)` sends to ALL authenticated clients.
This is correct for events where every nearby-helper map needs to refresh (REQUEST_CREATED, REQUEST_CANCELLED).

But lifecycle events (claim, en-route, arrived, complete) were using broadcastRequestEvent too — wasteful.

**Fixed pattern:**
```
sendToRequestParticipants(requester_id, helper_id, { type: "REQUEST_ACCEPTED", payload });
broadcast({ type: "request_updated", payload });  // global map refresh
```

- Typed event (REQUEST_ACCEPTED / HELPER_MOVING / HELPER_ARRIVED / REQUEST_COMPLETED) → participants only
- Legacy request_updated → global (all helpers on map see the pool change)

**Why:** `broadcastRequestEvent` was the original convenience wrapper before `sendToRequestParticipants` existed. Don't use it for lifecycle events — it exposes private request state to all connected users.

## Requester tracking card states

`request.helper_id === null` → "Finding You a Helper" amber state (was wrongly showing "On the Way")
`helper_id set + status=claimed` → "Helper Accepted"
`status=en_route` → "Your Helper is On the Way" + Live location badge when helperLocation is set
`status=arrived` → "Your Helper Has Arrived"

## WS handler deps (useState setters)

`useState` setters (setHelperLocation, setBirdCelebrating, etc.) are stable — intentionally omitted
from `useCallback` deps in `useWebSocket`. This is not a bug; document the intent with a comment
so future reviewers don't add them unnecessarily.
