---
name: Civic need claim notification
description: How sponsors get alerted when their posted civic need is claimed
---

`PATCH /civic/needs/:id/claim` in `civic.ts` now calls `notifySponsorOfClaim`
after the atomic claim succeeds. It:

- Looks up the sponsor's `submitted_by_user_id` + `contact_email` from
  `governmentSponsorsTable` via the need's `government_sponsor_id`.
- Sends via `sendPushToUser` (from `routes/push.ts`) with `notifType:
  "task_accepted"` — this reuses the existing push pipeline, which already
  falls back to email automatically when there's no active push subscription
  or VAPID isn't configured. No separate email call was needed.
- Fire-and-forget: the notify call is `.catch()`-guarded so a notification
  failure never blocks or fails the claim response itself.

**Why:** `sendPushToUser`'s built-in `fallbackEmail` option already covers
"push OR email" — writing a second parallel email path would have
duplicated delivery logic for no benefit.

**How to apply:** any future "notify on state change" feature for
sponsors/gov accounts should follow this same pattern — resolve the
sponsor's user id + contact email, call `sendPushToUser` with the closest
matching `notifType`, and never let the notify call block the primary
mutation response.

## Completion notification

`PATCH /civic/needs/:id/complete` follows the identical pattern via
`notifySponsorOfCompletion`: fires after the transaction (need→completed +
NET30 invoice insert) commits, fire-and-forget, same `task_accepted`
`sendPushToUser` call with `fallbackEmail`. Message includes invoice amount
+ due date. Both claim and completion notifiers now exist side by side in
`civic.ts`.
