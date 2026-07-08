---
name: PostGIS Requirement for Railway Deployment
description: The Railway Postgres plugin image lacks PostGIS — Niakofa requires it for all location queries.
---

**Rule:** Niakofa's database MUST use a PostGIS-enabled Postgres image. The default Railway Postgres plugin (`ghcr.io/railwayapp-templates/postgres-ssl:18`) is standard Postgres with no PostGIS extension. Migrations fail with `extension "postgis" does not exist`.

**Why:** All location-based queries (nearby requests, helper proximity, ST_DWithin) require the PostGIS extension.

**How to apply:** Use `postgis/postgis:16-3.4` (or latest) as a Custom Image in Railway. Enable Private Networking so it gets `postgres.railway.internal`. Full migration instructions are in `RAILWAY_DEPLOY.md` under "⚠️ Critical: PostgreSQL Must Have PostGIS Extension".
