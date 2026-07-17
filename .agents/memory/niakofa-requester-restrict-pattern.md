---
name: Niakofa requester-owner FK pattern (RESTRICT vs SET NULL)
description: When a user-owned record's FK should block deletion (RESTRICT) instead of going anonymous (SET NULL), and how to check the *real* DB constraint instead of the drizzle schema file.
---

Two different fixes for the same bug class, chosen by what the column means:

- **Owner-of-record columns** (e.g. `help_requests.requester_id` — there is no
  "no owner" state, every request has exactly one requester) should be
  `ON DELETE RESTRICT`, not `SET NULL` and not `CASCADE`. RESTRICT makes the
  database itself refuse to delete a user while any of their owned records
  still exist, so history can never be silently destroyed — instead of
  auditing every downstream consumer of that column to handle a sudden null.
- **Optional-participant columns** (e.g. `helper_id`, `pledged_by`, a
  claimant/reviewer/co-helper) already have a legitimate "nobody yet" state
  elsewhere in the app, so `SET NULL` is safe and matches existing UI/logic.

**Why:** `help_requests.requester_id` was `CASCADE` since an old migration.
The app-level delete guard only checked for the user's *open* requests, so an
account with only completed/cancelled request history could still be
deleted — cascading away that entire history. Switching straight to
`SET NULL` would have required auditing every one of the (many) places that
assume `requester_id` is non-null; RESTRICT fixed the actual bug (silent
loss) with a much smaller, safer blast radius, at the cost of also blocking
that user's deletion until support intervenes — an acceptable trade for an
owner column.

**How to apply:** before trusting a "missing FK" audit finding, verify
against the live database (`psql ... pg_constraint`), not just the
drizzle `schema/*.ts` files — several tables in this repo have hand-written
SQL migrations that added real FK constraints (with specific onDelete
behavior) that were never mirrored back into the drizzle schema file, so a
schema-file-only audit will report false "no FK" positives and can miss the
real (and sometimes wrong, e.g. CASCADE-on-an-owner-column) behavior already
live in the database.
