---
name: Local PostgreSQL preview
description: Development previews use a reusable local PostgreSQL cluster and tolerate missing PostGIS through the existing Haversine fallback.
---

Local API and Nia previews must use the isolated PostgreSQL cluster under `/tmp`, with `DATABASE_SSL=disable` and a local Nia service URL. The standard PostgreSQL 16 module does not provide PostGIS, so the extension-only migration is recorded as intentionally skipped when unavailable.

**Why:** The workspace's Railway-private database hostname is unreachable from Replit previews, while the local PostgreSQL module is usable but lacks PostGIS. Keeping migrations first preserves schema/readiness gates without requiring production credentials or weakening geographic queries.

**How to apply:** Route development API and Nia workflows through the local PostgreSQL launcher. Reuse its cluster across restarts, run the canonical migration and seed sequence, and do not reuse this helper in production.