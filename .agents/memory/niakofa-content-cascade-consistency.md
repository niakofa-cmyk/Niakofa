---
name: Niakofa content-table cascade consistency
description: Every content table has a mix of user-FK onDelete modes; only "cascade" on the primary content row is ever wrong — check siblings on the same table before assuming a fix is complete.
---

Three content tables (`civic_needs.posted_by_user_id`, `audio_circle_sessions.host_id`,
`griot_stories.author_id`) had `onDelete: "cascade"` on the FK to the row's *owner*,
while every *other* user-FK on the same table already used `"set null"` (e.g.
`civic_needs.claimed_by_user_id`, `griot_stories.request_id`/`community_id`/`hub_id`).
Deleting the owner's account silently destroyed shared community content — including
content other users had already claimed, completed, or participated in.

**Why:** a content row (civic need, audio circle session, heritage story) is a shared
artifact, not personal data — losing it on an unrelated account deletion is collateral
damage to everyone else connected to it, not a privacy win. Migration
`0068_fix_content_cascade_deletes.sql` changed these to `set null`/`restrict` to match
the pattern already established elsewhere in the same tables.

**How to apply:** when adding a new content table or a new user-FK to an existing one,
check what `onDelete` mode the table's *other* user FKs already use — `"cascade"` on an
owner FK is a strong signal something was missed, not a deliberate choice, unless the
row itself has no value without that specific owner (e.g. a private draft).

Making an FK `set null` also requires dropping its `.notNull()` — grep the columns
that read it afterward (`eq(table.id, row.owner_id)`, `inArray(...)`, or a
`.get(row.owner_id)` map lookup) since they now need a null guard; TypeScript will
catch these once the schema type changes, but only if `tsc --build` is actually run.
