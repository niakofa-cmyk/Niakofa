---
name: Niakofa anomaly worker Redis deduplication
description: How anomaly alerts are deduplicated across server restarts and instances using Redis TTL keys.
---

## Rule
`detectAnomalies()` in `anomaly-worker.ts` uses Redis keys (`anomaly:alert:${key}`, EX 7200s) to mark that an alert has been sent. Check with `wasAlertedRecently(key)`, record with `recordAlert(key)`. Never use an in-memory Map alone.

**Why:** In-memory Maps are lost on server restart. A restart during an active anomaly surge would re-fire all alerts. Redis TTL gives correct cooldown behavior across restarts and across multiple instances running behind a load balancer.

**How to apply:**
- Any new anomaly check must call `wasAlertedRecently(alertKey)` before logging/broadcasting, then `recordAlert(alertKey)` after sending.
- Alert key format: `${kind}:${entity_id}` (e.g. `low-trust:42`, `no-show:1001`).
- The in-memory fallback (`_memLastAlertedAt` Map) evicts entries when size > 500. It is the fallback only — Redis is the source of truth.
- ALERT_COOLDOWN_SEC = 7200 (2 hours). Override via `ANOMALY_*` env vars for tuning without redeploy.
