---
name: Niakofa Dispatch Suggest — auto-assign advisory panel
description: POST /helpers/auto-assign/:requestId is advisory only. Frontend DispatchSuggestSection must use the actual API field names.
---

## Route
`POST /helpers/auto-assign/:requestId` — requires `requireAuth` + `requireAdmin()`

## Actual API response shape
```json
{
  "helper_id": 42,
  "helper_name": "Jane Doe",
  "distance_miles": 1.3,
  "eta_minutes": 4,
  "match_score": 87
}
```

**NOT** `suggested_helper_id` / `suggested_helper_name` — those field names don't exist.

## Behavior
- Finds highest `match_score` helper within 5-mile bounding box who has `helper_mode_active = true`
- `match_score` = `computeMatchScore(skills, category, urgency, dist, availability)`
- ETA = `dist * 3` minutes (3 min/mile baseline)
- **Advisory only** — does NOT write to the database; just returns the suggestion

## Admin UI
`SystemTab > DispatchSuggestSection` — input a request ID, click Suggest, see result card with helper name, distance, ETA, and match score badge.

## Why I should not confuse this with auto-assignment
The route name is misleading. It does a ranking and returns a suggestion, but the admin must manually decide whether to contact or assign the helper through other means.
