---
name: Niakofa multi-helper coordination credits
description: Goodwill credit (+1) awarded to co-helpers in request_helpers when a request completes.
---

# Niakofa Multi-Helper Coordination Credits

## Location
`artifacts/api-server/src/routes/requests.ts` — inside `POST /requests/:id/complete` handler, after the primary goodwill/pool payment logic.

## Behavior
- After primary helper payment is complete, query `requestHelpersTable WHERE request_id = X`
- Filter out the primary `helperId` (they get their main payment, not a second credit)
- For each co-helper: fire-and-forget `usersTable.goodwill_score + 1` + "goodwill" transaction insert
- Max credit: +1 goodwill per co-helper (light, not financial)
- Description: `"Coordination credit: \"${request.title}\""`

## Safety
- Entire block is wrapped in try/catch — never throws
- Each individual update is `.catch()` chained — never blocks the primary flow
- Never touches the primary helper's payment chain

**Why:** Co-helpers who show up to coordinate but don't claim primary payment currently get nothing. A +1 goodwill credit acknowledges their presence and keeps multi-helper flows incentivized without creating payment complexity.
