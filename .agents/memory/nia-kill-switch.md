---
name: Nia Kill-switch Architecture
description: How Nia AI is disabled by default and how the kill-switch is enforced across all layers.
---

**Rule:** Nia is DISABLED by default for all users. An admin must explicitly enable it.

**Why:** The system is designed fail-closed — infrastructure failures (DB down, missing row) must never accidentally enable AI for users.

**How to apply:** Every new route or worker that involves Nia AI must call `isNiaEnabled()` from `artifacts/api-server/src/lib/db-helpers.ts` before any AI work. Never duplicate the raw DB query.

## Layers (all must be enforced):
1. **DB seed**: `migrate.sql` seeds `nia_enabled = 'false'` with `ON CONFLICT DO NOTHING` (preserves admin toggles)
2. **Backend isNiaEnabled()**: Shared function in `db-helpers.ts` with 10s TTL cache + generation counter race fix + in-flight deduplication. Only `row.value === "true"` enables; DB error → false.
3. **API routes**: nia-proxy, nia-context, nia-voice all import `isNiaEnabled` from db-helpers and check before serving
4. **Workers**: nia-checkin-worker, nia-push-queue-worker check isNiaEnabled before processing
5. **nia-service**: Has its own `isNiaEnabled()` with 10s TTL cache (defense-in-depth since the proxy already blocks)
6. **Admin toggle**: `POST /admin/nia-toggle` in admin-analytics.ts calls `resetNiaEnabledCache()` after DB write for instant propagation
7. **Frontend**: AppContext polls `/api/admin/nia-status` every 60s + WS `nia_status` event for instant toggle. `NiaGlobal` returns null while loading, hides FAB+Drawer when `niaEnabled !== true`.

## Race-condition protection in the cache:
The `_niaGeneration` counter increments on `resetNiaEnabledCache()`. Before a DB query, the generation is captured. After the query resolves, the result is only written to cache if the generation hasn't changed. This prevents a pre-toggle in-flight DB read from silently overwriting the cache with a stale value.
