---
name: Railway health probes
description: Keep Railway and external health checks aligned with the co-located API and Nia services.
---

The Railway readiness probe is `/api/healthz`; external monitors may still call `/api/health` for the co-located Nia service. Both endpoints must exist, and the compatibility probe must use a short timeout so a missing Nia child process cannot hang monitoring.

**Why:** The deploy workflow called `/api/health` even though only `/api/healthz` and `/api/status` were registered, producing a false deployment failure/hanging monitor.

**How to apply:** Keep `/api/healthz` focused on API/database readiness. Use `/api/health` for bounded Nia-service compatibility reporting, and make CI probe the actual production URL with retries and non-silent failures.