---
name: Niakofa claim concurrency & cancel route
description: How the claim race is handled correctly, and the missing /cancel route that was silently 404ing
---

## Claim concurrency — verdict: correct

The `/requests/:id/claim` route uses a conditional UPDATE as an atomic test-and-set:

```sql
UPDATE help_requests
SET status = 'claimed', helper_id = $helperId, claimed_at = NOW()
WHERE id = $requestId AND status = 'open'
RETURNING *
```

PostgreSQL serializes row-level writes. If two helpers POST simultaneously, one wins (gets a row back) and the other gets 0 rows → 409 "Request already claimed or not found". This is correct and sufficient — no advisory lock or FOR UPDATE needed for this pattern.

**Gap**: The pre-checks (sensitive category tier, travel distance) run *before* the atomic UPDATE via separate SELECTs. A helper who passes those checks can still lose the race. The 409 message is honest: "already claimed". That's acceptable.

## Cancel route — was completely missing

`POST /requests/:id/cancel` was called by the frontend (`request-active.tsx`, `handleCancel`) but never existed on the server. Every cancel attempt silently returned 404, which the frontend caught as "Failed to cancel".

### Fixed semantics (added in requests.ts)

**Helper cancels (releases claim):**
- Sets `status = 'open'`, clears `helper_id`, `claimed_at`, `en_route_at`, `arrived_at`
- Records `cancelled_at` for audit
- Broadcasts `REQUEST_CANCELLED` + `request_updated` so WS clients re-show the request
- Re-opens for another helper — fair to the requester
- WHERE guard: `helper_id = callerId AND status NOT IN ('completed','cancelled')`

**Requester cancels (withdraw):**
- Sets `status = 'cancelled'`, records `cancelled_at`
- Broadcasts `REQUEST_CANCELLED` + `request_updated`
- WHERE guard: `requester_id = callerId AND status NOT IN ('completed','cancelled')`
- CAN cancel even after helper is en_route/arrived — rare but valid (emergency)

**Both branches use atomic WHERE guards** so concurrent cancel+complete don't race.

## WsEventType fix

`"REQUEST_CANCELLED"` was not in the `WsEventType` union in `ws-hub.ts`. Added it alongside `REQUEST_CREATED`, `REQUEST_ACCEPTED`, etc.

**Why:** TypeScript would accept the string literal at call site but emit a type error at the union boundary. Adding it makes the type contract accurate and enables frontend WS listeners to pattern-match on it.
