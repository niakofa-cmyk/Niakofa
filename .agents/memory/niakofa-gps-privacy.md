---
name: Niakofa GPS Privacy — GET /requests/:id
description: GET /requests/:id fuzzes lat/lng for users without operational need; only requester, assigned helper, and admins receive full precision.
---

## Rule
`GET /requests/:id` performs an explicit access check before returning coordinates:

```
isRequester      = request.requester_id === authenticatedUserId
isAssignedHelper = request.helper_id === authenticatedUserId
isAdmin          = authUser?.is_admin === true
hasFullAccess    = isRequester || isAssignedHelper || isAdmin
```

If `!hasFullAccess`, lat/lng are fuzzed by `± 0.0009°` (~100 m) — same jitter as `/requests/nearby`.

**Why:** Any authenticated user who knows a request ID could previously retrieve exact home address coordinates. Fuzzed-only browsing existed on nearby/list endpoints but not on the detail endpoint.

**How to apply:**
- The admin check uses a parallel `Promise.all` — one query for the requester info, one for `is_admin` on the calling user — to avoid sequential round-trips.
- The fuzzed `lat`/`lng` values are written explicitly into the response object (overriding the spread `...request`) so they propagate cleanly.
- Do NOT apply fuzzing to `/requests/:id/claim`, `/requests/:id/en-route`, or `/requests/:id/arrived` — those are already gated to requester/helper only.
