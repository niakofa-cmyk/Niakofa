# Authoritative Neighborhood Ingestion + Geometry Verification

Niakofa now separates **source ingestion**, **geometry validation**, **human review**, and **GPS activation**. A neighborhood can be discovered or imported without becoming a Host Signal boundary.

## Source policy

1. Municipal GIS
2. County GIS
3. State/regional public GIS
4. Reviewed OpenStreetMap geometry
5. Niakofa-curated geometry
6. Generated hints — discovery only, never GPS verification

The Census remains authoritative for legal/statistical geographies it publishes, but it is not treated as a universal neighborhood-boundary provider.

## Launch sources

### Fort Worth

The first municipal source is the City of Fort Worth GIS `Planning_Development/Zoning/MapServer/37` **Neighborhood Alliances** polygon layer. The public layer exposes polygon geometry and a `NAME` field and supports GeoJSON queries.

Source discovery: https://mapit.fortworthtexas.gov/ags/rest/services/Planning_Development/Zoning/MapServer/layers

The importer records the exact dataset path, retrieval timestamp, content version/ETag when available, source feature ID, and the returned geometry. It does **not** assume that every imported organization/area name is one of Niakofa's product neighborhoods. Admin review is required before activation.

### Kansas City, Missouri

The initial source is Kansas City, Missouri's public **Kansas City Neighborhood Boundaries** dataset (`q45j-ejyk`). The importer uses the public Socrata endpoint and adapts its `the_geom` geometry into canonical GeoJSON.

Source discovery: https://data.kcmo.org/Neighborhoods/Kansas-City-Neighborhood-Boundaries/q45j-ejyk/about

The number of Kansas City neighborhoods is never hardcoded. The current source dataset is the source of truth for the imported candidate set.

## Pipeline

```text
public GIS source
      ↓
content-addressed ingestion
      ↓
neighborhood_boundary_imports (staging)
      ↓
GeoJSON structural validation
      ↓
admin review + review note
      ↓
explicit geometry verification
      ↓
promotion to city_neighborhoods
      ↓
Host Signal / local Spiral eligibility
```

### Structural validation

The ingestion layer requires:

- Polygon or MultiPolygon geometry;
- WGS84 longitude/latitude ranges;
- closed rings with at least four positions;
- a usable neighborhood name;
- a stable source feature ID;
- recorded source publisher, dataset, URL, version and retrieval time.

Structural validity is **not** the same as human verification. `geometry_valid=true` only means the imported GeoJSON passed the ingestion contract. `geometry_verified=true` is an explicit review decision.

## Admin review

Staged imports are available through:

- `GET /admin/neighborhood-boundary-imports`
- `PATCH /admin/neighborhood-boundary-imports/:id/review`
- `POST /admin/neighborhood-boundary-imports/:id/promote`

Promotion requires all of:

- source is not a generated hint;
- geometry is structurally valid;
- an admin marked the feature reviewed;
- an admin explicitly marked geometry verified.

Promotion copies the provenance into `city_neighborhoods` and sets `geometry_verified=true`. Generated neighborhood hints cannot pass this gate.

## Operational rule

Only promoted rows with verified geometry can drive the GPS Host Signal neighborhood fence. If authoritative geometry has not yet been reviewed, Niakofa must show a pending/unknown neighborhood state rather than invent a boundary from a name or geocoder hint.

Joining a Spiral remains independent of GPS. Hosting is the location-gated action.

## Commands

Run the importer from the repository workspace after migrations are applied:

```bash
pnpm --filter @workspace/scripts run ingest:neighborhood-boundaries -- fort_worth
pnpm --filter @workspace/scripts run ingest:neighborhood-boundaries -- kansas_city_missouri
```

Contract tests:

```bash
pnpm --filter @workspace/scripts run test:neighborhood-ingestion
```

The importer is idempotent for a given source feature + source version. Imported boundaries remain GPS-ineligible until the admin review/promotion step.
