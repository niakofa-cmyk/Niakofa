---
name: Exchange spatial fallback
description: Durable constraints for Exchange proximity matching across PostGIS and plain PostgreSQL environments.
---

Exchange proximity matching has two supported database modes: production PostGIS with a stored geography point and GiST index, and plain PostgreSQL with bounded Haversine filtering. Both modes must expose the schema columns that Drizzle writes, even when the geography type is unavailable.

**Why:** A no-PostGIS local migration omitted the optional `geog` column, causing ordinary Exchange listing inserts to fail; the first production geography migration also reused the fallback B-tree index name, so its GiST creation could silently no-op.

**How to apply:** Keep the PostGIS readiness probe tied to the dedicated GiST index, use a distinct index name from the latitude/longitude fallback index, and include an idempotent fallback-column repair whenever the schema contains an optional spatial field.