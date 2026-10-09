# Neighborhood Geometry Verification Runbook

This runbook separates **source ingestion**, **structural GeoJSON validation**, **PostGIS topology validation**, and **human/admin verification**.

## Safety contract

An imported feature is not GPS-eligible merely because it has valid JSON geometry. The operational path remains:

```text
municipal GIS
  → neighborhood_boundary_imports
  → structural geometry validation
  → PostGIS validity report
  → admin review
  → geometry_verified
  → promote to city_neighborhoods
  → Host Signal / GPS geofence
```

Do not use `ST_MakeValid` as an automatic replacement for authoritative source geometry. If PostGIS reports invalid topology, resolve it against the source and document the review decision.

## Run the report

From the repository root, with `DATABASE_URL` pointing at the target database:

```bash
pnpm --filter @workspace/scripts run verify:neighborhood-boundaries
```

The command is read-only. It reports:

- total staged imports;
- PostGIS-valid and invalid geometries;
- structurally valid but not yet verified features;
- any impossible state where a verified feature has invalid PostGIS geometry;
- `ST_IsValidReason` for invalid features.

Exit codes:

- `0`: no invalid PostGIS geometries and no verified-invalid features;
- `2`: at least one invalid geometry was found;
- `1`: the verification command itself failed.

## Railway production gate

The operator confirmed that Railway's production `zesty-ambition` service
references the **Postgres** service for `DATABASE_URL`; the separate **PostGIS**
service is not the app's configured database
([current status](RAILWAY_POSTGIS_PRODUCTION_STATUS.md)). This verifies the
configured target only; it does not prove the `postgis` extension, migrations,
columns, triggers, or indexes are present in the app's Postgres database.

Before treating a production geometry report as evidence, run the read-only
checks in
[`runbooks/production-postgis-diagnostic.sql`](runbooks/production-postgis-diagnostic.sql)
from an approved read-only session connected to the **Postgres** service
referenced by the app. Do not use the separate PostGIS service or its TCP proxy
as a substitute. Never paste or record the connection string. Service health and
variable names are not substitutes for a database query.

## Promotion rule

Only promote a feature after an administrator has reviewed the source, confirmed that the polygon represents the intended neighborhood, and marked it `geometry_verified`. The PostGIS report is a technical gate, not a substitute for geographic review.

For Fort Worth, the nine Niakofa product neighborhood names remain a product launch catalog. They must be explicitly mapped to authoritative municipal GIS features before they can become green GPS checkpoints; do not infer an exact city boundary from a name match alone.

For Kansas City, ingest the complete public municipal neighborhood dataset and review/promote the applicable features without hardcoding a neighborhood count.
