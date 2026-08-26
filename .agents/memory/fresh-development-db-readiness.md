---
name: Fresh development database readiness
description: How to interpret a reachable but unmigrated development database in this project.
---

A newly provisioned development PostgreSQL database may be reachable while still lacking the application schema. API readiness should be evaluated only after the repository's canonical development migration flow has run; never compensate by adding startup-time or production DDL.

**Why:** A fresh workspace can produce a misleading combination of successful database connectivity and an unready API because required tables do not exist yet.

**How to apply:** Check connectivity and required-table presence separately. If the development schema is absent, use the ordered, idempotent development migration runner, restart the API workers, and recheck the readiness endpoint. Production schema changes belong to the platform publish flow.