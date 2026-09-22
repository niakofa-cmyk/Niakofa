---
name: Niakofa forensic v7 fixes
description: Key patterns and gotchas discovered while fixing the forensic report v7 bugs (July 2026). Durable rules for future sessions touching these code paths.
---

# Niakofa forensic v7 fixes

## Rules / decisions

**Pledge dedup must include user_id in WHERE.**
A dedup check on `(request_id, type, amount, created_at)` without `user_id` becomes a cross-user DoS: User A's pledge blocks User B from pledging the same amount on the same request within the time window.
**How to apply:** Always add `eq(transactionsTable.user_id, userId)` to any dedup query on transactionsTable.

**pledge_paid must be updated with an atomic SQL increment, never read-then-write.**
`SET pledge_paid = COALESCE(pledge_paid, 0) + $amount` is correct. The prior `const newPledgePaid = (request.pledge_paid || 0) + amount` is a TOCTOU race: two concurrent pledges both read the same original value and the second write silently overwrites the first.
**Why:** This is a financial column — silent data loss from a race is unacceptable.

**Reset-password: ALL failure paths must return the same HTTP status and body.**
Wrong account (no user found), wrong code, and expired code must all return 403 with an identical message. Returning 400 for bad/expired code and 403 for missing account is a status-code oracle that leaks which emails are registered.
**How to apply:** Use a shared `RESET_FAIL` constant (`{ status: 403, body: { error: "..." } }`) and reuse it for every branch.

**en-route and arrived transitions need status guards in the WHERE clause.**
`POST /requests/:id/en-route` must include `AND status = 'claimed'` in its UPDATE WHERE.
`POST /requests/:id/arrived` must include `AND status = 'en_route'` in its UPDATE WHERE.
Without these, a concurrent cancellation between the caller's implicit ownership check and the actual write produces an inconsistent state. Return 409 (not 404) when the row matches on id+helper_id but fails the status check — the request still exists, the caller just can't transition it.

**pledge-worker must filter pledge_status = 'active'.**
Forgiven and written_off pledges must never generate reminders or affect the outstanding-balance metric. Add `eq(requestsTable.pledge_status, "active")` to the reconciliation query.

## What was already built (verified July 2026 — do NOT re-implement)

- `POST /requests/:id/cancel`: fully implemented with helper-release-to-open and requester-withdraw paths, concurrency-safe WHERE clause.
- Pin-coordinate fuzzing: `fuzzCoordinates()` in requests.ts applied to all open-request responses in both `/requests/nearby` and `/requests`.
- Crisis default message: no longer hardcodes "Tarrant County" — says "in your area".
- Pool-runway dashboard: built in community.tsx (PledgePoolDashboard) and admin.tsx (runway_days widget).
- Business signup form: login.tsx already has `accountType === "business"` path.
- "Posting as" switcher: request-new.tsx already fetches `GET /api/businesses/mine` and shows the switcher.
- Repayment reminder job (push): pledge-worker already sent push reminders for overdue scheduled payments before this session.
