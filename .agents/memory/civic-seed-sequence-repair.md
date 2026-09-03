---
name: Civic seed sequence repair
description: The civic coverage seed must tolerate imported rows whose serial sequence is behind the table.
---

An idempotent seed cannot assume a PostgreSQL serial sequence is aligned with
the stored rows. Imported or legacy civic data may contain a higher primary
key while the sequence still points at an already-used value. Realign the
sequence from the current maximum before the seed inserts any missing
resources.

**Why:** Startup seeding runs during every API bootstrap, so one stale serial
sequence can turn a harmless repair into a fatal duplicate-primary-key error.

**How to apply:** Keep the repair scoped to the affected table and run it
before both national coverage inserts and downstream city/resource seeds.