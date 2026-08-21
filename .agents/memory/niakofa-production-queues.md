---
name: Production queue boundary
description: Reliability boundary for Redis-backed background jobs.
---

Production API startup must fail closed when `REDIS_URL` is missing or malformed. Payouts, cashouts, notifications, and reconciliation cannot rely on interval fallbacks for correctness.

**Why:** A server that accepts traffic while critical workers are disabled can appear healthy while money-moving and user-notification jobs silently stop.

**How to apply:** Keep the explicit scheduler fallback for development and local preview only. Treat a resolved `redis://` or `rediss://` URL as a production prerequisite and document it as required in deployment configuration.