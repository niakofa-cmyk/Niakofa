---
name: PostgreSQL JSONB parameter typing
description: Prevent unknown-type errors when ORM-bound values enter polymorphic PostgreSQL JSON builders.
---

Explicitly cast interpolated values passed to polymorphic PostgreSQL functions such as `jsonb_build_array` (for example, `$1::text`). A JavaScript string does not guarantee that PostgreSQL can infer an extended-protocol parameter's SQL type.

**Why:** A cleanup-ledger update failed in production with PostgreSQL's “could not determine data type of parameter” error before external storage I/O, turning an upload chunk into a 503.

**How to apply:** Add an explicit SQL cast at the polymorphic function boundary and exercise the prepared expression against PostgreSQL. Typechecks and source-pattern tests alone may not expose parameter-inference failures.