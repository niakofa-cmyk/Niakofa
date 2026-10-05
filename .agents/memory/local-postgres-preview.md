---
name: Local PostgreSQL preview
description: Development previews use a reusable local PostgreSQL cluster and tolerate missing PostGIS through the existing Haversine fallback.
---

Local API and Nia previews must use the isolated PostgreSQL cluster under `/tmp`, with `DATABASE_SSL=disable` and a local Nia service URL. The standard PostgreSQL 16 module does not provide PostGIS, so the extension-only migration is recorded as intentionally skipped when unavailable.

**Why:** The workspace's Railway-private database hostname is unreachable from Replit previews, while the local PostgreSQL module is usable but lacks PostGIS. Keeping migrations first preserves schema/readiness gates without requiring production credentials or weakening geographic queries.

**How to apply:** Route development API and Nia workflows through the local PostgreSQL launcher. Reuse its cluster across restarts, run the canonical migration and seed sequence, and do not reuse this helper in production.

Restart the API and Nia workflows sequentially, waiting for each service to
finish startup before restarting the other. They share the same local cluster;
back-to-back restarts can interrupt the API's seed connection.

**Why:** Restarting both workflows in sequence while the API was still seeding
caused a PostgreSQL connection termination. After Nia settled and the API was
restarted once, both services remained healthy.

**How to apply:** Restart one workflow at a time. If the API fails during
seeding, first confirm the local cluster is accepting connections, then restart
the API after the other service has completed startup.