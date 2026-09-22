---
name: Niakofa account-delete cascade guard
description: help_requests.requester_id is ON DELETE CASCADE from users; deleting an account with an open/ongoing request used to silently wipe that request.
---

`help_requests.requester_id → users(id) ON DELETE CASCADE` (migration 0020) and
similar cascades on `transactions`, `disputes`, `chat_messages`, `ratings`
mean a user-delete instantly and irrecoverably deletes every request/message/
rating tied to that account — including ones still `open`/`claimed`/`en_route`/
`arrived`/`pending_owner_approval`. Both `DELETE /users/me` (self-delete) and
`DELETE /users/:id` (admin) used to run straight to `db.delete(usersTable)`
with no check for live data.

**Why:** the user-facing expectation (and an explicit product requirement) is
that open/ongoing request data must never silently disappear from the live
app just because an account gets deleted — a requester or an actively-engaged
helper deleting their account mid-task would otherwise vanish the request
with no trace, no notification to the other party, no audit record.

**How to apply:** both delete routes now call a shared
`findBlockingActiveRequests(userId)` guard (checks requester_id in
open/claimed/en_route/arrived/pending_owner_approval OR helper_id in
claimed/en_route/arrived) and return 409 with `blocking_request_ids` if
anything is still live — the user/admin must cancel or complete those first.
`help_requests.helper_id` is already `ON DELETE SET NULL` (safe on its own),
so the helper-side check exists purely to stop an active helper from vanishing
mid-job, not to prevent data loss on that FK. If adding new cascading FKs from
users/help_requests, re-check whether this guard needs to cover the new table
too.
