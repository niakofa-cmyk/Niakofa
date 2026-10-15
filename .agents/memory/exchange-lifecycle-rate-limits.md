---
name: Exchange lifecycle test throttling
description: Keep migration-backed Exchange route integration tests deterministic without bypassing production rate limits.
---

The lifecycle harness runs the real Exchange router, so listing creation and edits count against the same five-per-user, fifteen-minute community-post limit. A batch of independent discovery listings can consume the fixture seller's allowance before later privacy scenarios run.

**Why:** CI exposed a 429 inside the spatial integration step even though the Haversine assertions had passed; the failure came from the child Exchange lifecycle test, not spatial behavior.

**How to apply:** Use distinct fixture owners for independent discovery creates and use the actual listing owner for follow-up edits. Keep the real limiter enabled; test throttling separately rather than disabling it across the route harness.
