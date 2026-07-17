---
name: Niakofa civic resources admin CRUD
description: Admin CRUD for civic_resources (the map's help-center directory) and the cache-invalidation tradeoff it required.
---

Admin routes: GET/POST `/admin/civic/resources`, PATCH/DELETE `/admin/civic/resources/:id` in `civic.ts`. Frontend lives as a "Resource Directory" sub-tab inside `AdminCivicRequestsTab` (admin.tsx), not a new top-level admin tab — a local toggle was enough since it's a low-frequency edit surface.

**Cache invalidation tradeoff:** the public `/civic/resources` (`civic:all`, 1hr TTL) and `/civic/resources/nearby` (`civic:loc:*`/`civic:nearby:*`, 5min TTL) routes cache by exact key. `cacheDel()` only deletes one exact key — no Redis SCAN/wildcard delete exists in `lib/cache.ts`. On any admin write we invalidate `civic:all` only; the per-location/per-viewport geo caches are left to expire on their own short TTL.

**Why:** parameterized geo-cache keys can't be enumerated without a SCAN, and adding one just for this low-frequency admin edit path wasn't worth the complexity — a bounded few minutes of staleness on newly added/edited resources matches the existing TTL design philosophy used elsewhere in this file.

**How to apply:** if a future feature needs immediate geo-cache invalidation (e.g. real-time resource updates), add a Redis SCAN-based `cacheDelPattern(prefix)` to `lib/cache.ts` rather than trying to reconstruct exact keys.
