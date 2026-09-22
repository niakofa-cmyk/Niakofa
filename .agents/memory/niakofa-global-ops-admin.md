---
name: Niakofa global ops admin
description: GET /admin/global-ops returns live workers, Redis, WebSocket, navigation, storage, settings, and process metadata.
---

## Endpoint: GET /api/admin/global-ops

Returns the live operations snapshot consumed by Admin 2.0. The current contract is:

- `workers`: `all_critical_ok` plus the worker registry list.
- `websocket_hub`: current hub metrics such as connected clients.
- `redis`: configured, required, ready, and connection status.
- `navigation_circuit_breaker`: Mapbox/navigation circuit state.
- `storage`: non-secret storage backend description.
- `system_settings`: allowlisted non-secret operations settings.
- `process`: served commit, start time, Node version, uptime, and memory.

The endpoint does not return the former `summary`, `gps_health`, `regions`, or `feature_checks` fields. Admin KPI cards use the dedicated `/admin/stats` contract for users, active helpers, requests, and reports.

**Why:** Keeping the documented response contract aligned with the live API prevents Admin 2.0 from rendering fabricated zeroes or silently dropping operational health data.

**How to apply:** When changing this endpoint, update the Admin 2.0 dashboard, its wiring tests, and this contract note together. Do not reintroduce legacy summary fields solely to satisfy an old UI reader.
