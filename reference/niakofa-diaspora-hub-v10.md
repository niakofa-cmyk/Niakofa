# Diaspora Hub V10 integration reference

This document records the reviewed integration of the uploaded
`Niakofa_Diaspora_Hub_AutoMembership_V10_1789658964382.zip` package.

- Reference package SHA-256: `948937558adff6df798f408ee443e0f616d7f3bc9e1b8cf58161e35bd4a301f7`
- Reference baseline: `23733eb4517607050be4448c97ee64e445875c55`
- Canonical source: `artifacts/`

## Applied architecture

An account can receive ordinary membership in one canonical Diaspora Hub when
both conditions are true:

1. `users.approval_status = 'approved'`
2. `users.diaspora_hub_id` points to an approved canonical Globe Hub

The assignment is durable account context. It is never inferred from live GPS.
An admin assigns it from the Users tab, and the server accepts only approved
canonical Globe roots (not grouped local/city Hubs).

The database trigger creates or approves only an ordinary `member` membership.
It never grants representative, leader, or sponsor authority. Existing
`suspended` and `revoked` memberships are preserved and are not restored by
automatic assignment. Previous memberships remain explicit if a user’s home
Hub changes.

Hub-to-Hub messaging still requires approved source-Hub membership at both
option discovery and message-send time. Approved target-Hub membership is not
required. Pending or denied accounts cannot use an approved membership to
represent a Hub.

## Files

- `lib/db/migrations/0143_diaspora_hub_auto_membership.sql`
- `lib/db/src/schema/users.ts`
- `artifacts/api-server/src/routes/admin-analytics.ts`
- `artifacts/api-server/src/routes/diaspora-hub-messages.ts`
- `artifacts/pay-it-forward/src/pages/admin.tsx`
- `artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx`
- `artifacts/pay-it-forward/src/pages/diaspora-hub-messages.tsx`

The uploaded archive remains a reference artifact; it was not copied over the
canonical source blindly.