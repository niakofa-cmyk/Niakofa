---
name: Health Endpoint /status Design
description: Why nia_ai is excluded from allOk in the /status endpoint.
---

**Rule:** The `/api/status` endpoint's `allOk` check MUST NOT include `nia_ai`. Nia being disabled is an admin-controlled state, not a health failure.

**Why:** Nia is disabled by default. Including it in `allOk` caused the status endpoint to return HTTP 503 "degraded" whenever Nia was intentionally off — falsely signaling the platform is broken when it's fully operational. This also broke Railway health probes.

**How to apply:** `checks[]` array contains only infrastructure health (database, map token). Nia state is a separate `nia: { enabled, note }` informational field in the JSON response, not in `checks`. The HTTP status code is driven only by the infrastructure checks.
