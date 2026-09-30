---
name: Fresh development database readiness
description: Verify development schema readiness and physical column parity after migration.
---

A reachable development PostgreSQL database may still lack the application schema. Even after migrations succeed, an ORM declaration for an existing table can disagree with its physical columns. Neither typechecks nor source-contract tests prove a changed route can read and write against that database. Never compensate with startup-time or production DDL.

**Why:** A fresh workspace can have connectivity without tables; an additive feature can also compile and migrate successfully while a legacy column name mismatch still causes runtime failures.

**How to apply:** Run the ordered, idempotent development migrations, then compare changed ORM mappings to physical columns and exercise representative authenticated read and write paths. For rejected forms, inspect field-level validation and distinguish omitted fields from explicit nulls. Production schema changes belong to the platform publish flow.