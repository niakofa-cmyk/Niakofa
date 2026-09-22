---
name: Niakofa INNER JOIN against a nullable user FK
description: A bug class where rows silently vanish from a query's results (not the DB) whenever the joined-to user is gone; how to find and fix it.
---

Whenever a foreign key to `users` is nullable (`onDelete: "set null"`), any
`.innerJoin(usersTable, eq(usersTable.id, thatColumn))` on it will silently
drop the entire row from that query's results the moment the referenced user
is deleted — even though the row itself is untouched in the database. To the
user this looks exactly like "my data disappeared," but nothing was deleted;
it's just excluded from that one screen's query output.

**Why:** every time a cascade-delete gets fixed to `SET NULL` (see
niakofa-content-cascade-consistency.md) so the *content* survives, any
pre-existing `INNER JOIN` against that same column becomes a landmine —
fixing the delete-time bug quietly introduces a query-time one.

**How to apply:** whenever you change a user-referencing FK from `cascade` to
`set null`, immediately grep every `.innerJoin(usersTable, eq(usersTable.id,
<thatColumn>))` across the API routes and switch it to `.leftJoin` (with the
joined name/email field naturally coming back `null` for an orphaned row).
Columns with no FK constraint at all are just as exposed — check those too.
Do NOT convert `innerJoin`s on columns that still cascade-delete alongside
the user; there's no orphan possible there, and switching those to
`leftJoin` would be a no-op at best.
