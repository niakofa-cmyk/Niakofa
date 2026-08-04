---
name: Niakofa data-disappearing audit
description: Root-caused user reports of "data disappearing" while using the app — real fixes and which mechanisms were NOT the cause.
---

## Real bugs fixed
- **Audio Circles list flashing empty**: `audio-circles.tsx`'s `loadCircles()` (polled every 15s) called `setCircles([])` on any non-ok response or network error, wiping the on-screen list to empty on any transient blip even though the DB was untouched. Fixed to leave the last-known-good list rendered on failure and only replace it on a successful response. Same anti-pattern found and fixed in admin.tsx's civic-portal-requests loader.
- **Settings save race**: `PUT /users/:id/settings` did select-then-insert-or-update (not atomic). Two concurrent first-saves for a brand-new user's settings row could both see "no existing row," both insert, and one throws a unique-constraint violation — surfacing as "my settings didn't save." Fixed to a single `insert().onConflictDoUpdate({ target: user_id })` statement. Verified with 6 parallel PUTs — all succeeded, no errors, consistent final state.

## Investigated, NOT bugs (don't re-flag)
- `civic-needs.tsx`'s `fetchOpen/fetchClaimed/fetchMine` only call `setXxx()` inside the `if (res.ok)` branch — a failed fetch already leaves prior state untouched. An audit may flag "no persistence across unmount" here, but that's normal React remount behavior (fresh fetch on mount), not data loss — the component doesn't exist while off-screen so there's nothing to "wipe."
- `request-new.tsx` clearing the localStorage draft in `onSuccess` (before the optional post-creation Stripe payment-intent step) is correct: the help request itself is already durably created server-side at that point; only the *optional* immediate-payment UI could still fail, which doesn't lose the underlying request.
- Griot story translations `onConflictDoUpdate` — uses `field ?? undefined` per key, and Drizzle omits `undefined` values from the SQL SET clause, so an update with only `edited_text` provided does NOT clobber `nia_draft_text`. Already safe.
- Admin civic-resource PATCH already merges `body.field ?? existing.field` per column before writing — not a full-row overwrite. A theoretical concurrent-admin-edit race exists but is low-probability on a low-traffic admin surface; not worth the complexity of optimistic locking there.

## Still-open, lower-priority (not fixed this pass — architectural, not data-loss)
- `circleSessionParticipants` (WebRTC signaling) is in-memory only; a server restart mid-call freezes active audio circle sessions (DB state says "live" but signaling is dead) until participants manually leave/rejoin. This is a resilience gap, not data loss — no row is deleted, calls just need to be restarted.
