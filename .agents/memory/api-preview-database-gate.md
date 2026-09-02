---
name: API preview database gate
description: Managed API previews run migrations before opening the service port.
---

The managed API workflow is intentionally migration-first. If the configured development database hostname cannot resolve, the workflow exits before port 8080 opens; do not bypass migrations or add a fallback just to make the preview appear healthy.

**Why:** A green preview with an unapplied schema would hide a production-readiness failure and can make money-moving or recording flows appear valid when their tables are unavailable.

**How to apply:** When the API workflow fails before opening its port, verify database DNS/connectivity and migration logs first. Keep `/api/healthz` and `/api/readiness` fail-closed.