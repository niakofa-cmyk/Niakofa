---
name: Database worker readiness
description: Startup boundary for database-backed API workers and graceful readiness behavior.
---

Database connectivity alone is not enough to safely start Niakofa's API
workers. The worker bootstrap must also confirm that the canonical migrated
schema is present; otherwise an empty or partially initialized database causes
repeated background query failures while the HTTP process appears healthy.

**Why:** The managed preview can provide a PostgreSQL connection before
migrations have run. Starting schedulers in that state creates noisy retries
and obscures the real readiness failure.

**How to apply:** Keep `/healthz` and `/readiness` available for operators, but
pause database-backed workers until both connectivity and the canonical
`help_requests` table check succeed. Production startup runs migrations before
the API, so normal deployments continue to initialize workers.