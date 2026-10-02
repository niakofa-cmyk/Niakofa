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

Sequence repair alone does not protect against concurrent seed executions:
another process can reset the sequence after a sibling begins inserting, and
check-then-insert upserts can race. Serialize all civic-resource seed writers
with the same database-wide advisory lock for the full repair-and-write pass.

**Why:** API bootstraps rerun the idempotent seed, and overlapping starts can
produce a duplicate-key failure even when each process repairs the sequence.

**How to apply:** Hold a session-level advisory lock on a dedicated database
connection from before sequence repair through each seed entrypoint's final
write. Use the same lock for coverage and Fort Worth seeds, release it on every
exit, and retain a concurrent-seed regression test.

The canonical migration CI job must use a PostGIS-enabled PostgreSQL service;
the full migration chain is the release gate and a plain PostgreSQL image is
not an equivalent substitute.

**Why:** Several migrations use PostGIS-backed schema objects when the
extension is available, so a plain CI database can fail before the civic test
ever exercises the seed.

**How to apply:** Run the canonical migration command against the PostGIS
service before the isolated civic-seed regression; keep the test's own schema
disposable and separate from production. Local CI may set the explicit
`DATABASE_SSL=false` override for its non-TLS service container; production
must retain the default TLS-compatible setting.