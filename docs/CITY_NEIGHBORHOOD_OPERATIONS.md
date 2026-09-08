# City Neighborhood Operations + Spiral Geography

## Product decision

Niakofa has two related but different concepts:

1. **Product neighborhoods** — the neighborhoods we choose to launch as Spiral/community channels.
2. **Authoritative geography** — the reviewed polygon/geometry used to decide where a GPS pinpoint actually falls.

They must not be conflated.

A product neighborhood can exist before its authoritative geometry is verified. It may be visible as a Spiral/community destination, but it is **not GPS Host Signal eligible** until a reviewed boundary with provenance is effective.

## What is authoritative?

Use this order when collecting neighborhood names and boundaries:

1. Municipal GIS / municipal open-data boundary dataset.
2. County GIS when the municipality does not publish a suitable neighborhood layer.
3. State or regional public GIS.
4. Reviewed OpenStreetMap neighborhood/place geometry.
5. Explicitly reviewed Niakofa-curated geometry.
6. LLM/geocoder-generated names only as discovery hints.

Do not use an LLM, reverse-geocoder label, or map search result as the GPS boundary itself.

## Launch-city sources

### Fort Worth, Texas

The City of Fort Worth's GIS program exposes a first-party **Neighborhood Alliances** polygon layer. The layer is an ArcGIS Feature Layer and supports GeoJSON queries. This is the current authoritative geometry source being staged by Niakofa.

The important distinction is that **Neighborhood Alliances are not the same thing as the nine Niakofa product neighborhoods**. The nine current product neighborhoods are:

- Southside
- Near Southside
- Polytechnic
- Riverside
- Downtown
- East Fort Worth
- North Fort Worth
- Stop Six
- Wedgwood

These names should remain product-level labels until each one has an explicitly reviewed mapping to authoritative geometry. We should not silently assign an alliance polygon to a product neighborhood merely because the names look similar.

### Kansas City, Missouri

Kansas City, Missouri publishes a first-party **Kansas City Neighborhood Boundaries** open-data dataset. Niakofa uses its Socrata GeoJSON representation for machine ingestion so polygon/multipolygon geometry arrives as a standard GeoJSON FeatureCollection rather than relying on a row format that can omit or serialize geometry inconsistently.

The ingestion adapter remains backward-compatible with Socrata JSON arrays, but the canonical KCMO registry endpoint is the GeoJSON representation. The importer fails closed if the authoritative response contains zero features or produces zero valid named polygon features; it must never turn an empty successful HTTP response into an apparently successful geography import.

## Recommended canonical data flow

```text
City source
  ↓
Source registry
  ↓
Content-addressed staging import
  ↓
PostGIS geometry validation
  ↓
Admin review
  ↓
Explicit geometry verification
  ↓
Promotion to city_neighborhoods
  ↓
Neighborhood Spiral mapping
  ↓
GPS Host Signal eligibility
```

The staging importer must never make a row GPS-active by itself.

## GPS → Host Signal → Spiral ordering

For a fresh, accurate GPS fix:

1. Resolve the city server-side.
2. Test the pinpoint against **reviewed, effective neighborhood geometry for that city**.
3. If the point is inside a verified neighborhood, return that neighborhood and its mapped Spiral ID.
4. Render the **green GPS neighborhood checkpoint** above the Spiral list.
5. Move the matching neighborhood Spiral to position #1.
6. Keep the remaining neighborhood Spirals in their stable existing order.
7. Keep the city-wide Spiral(s) last.
8. A city-only GPS match may verify city hosting, but it must not be displayed as a green neighborhood checkpoint.
9. Joining a Spiral never requires GPS. Hosting remains GPS-gated.

This is city-agnostic. Fort Worth, Kansas City, Missouri, and every future city use the same contract; only their reviewed geography rows differ.

## One city, many neighborhoods

Do not create frontend logic such as:

```text
if city === Fort Worth → use these nine names
if city === Kansas City → use these names
```

Instead:

```text
city_key
  → reviewed city_neighborhoods rows
  → neighborhood_id
  → Spiral mapped to neighborhood_id
```

The UI should display whatever neighborhoods are currently available for that city and clearly distinguish pending/unverified rows from GPS-verified rows.

## Collection for new cities

For each new city:

1. Find the official city GIS/open-data portal.
2. Identify the best neighborhood/community polygon dataset.
3. Record publisher, discovery URL, machine dataset URL, license, retrieval time, and source version.
4. Import names + stable source feature IDs + geometry into staging.
5. Validate GeoJSON and PostGIS topology.
6. Review the source rows administratively.
7. Promote only reviewed, valid, non-generated rows.
8. Map promoted neighborhoods to Spirals.
9. Enable green Host Signal only after the geometry is effective and verified.
10. Re-ingest on source-version changes and flag affected verified rows for review.

## Spirals, Community, Diaspora, and Map

Use the same neighborhood identity across product surfaces:

- **Spirals:** live neighborhood and city-wide conversation channels.
- **Community:** neighborhood/community discovery and participation.
- **Diaspora:** durable geographic/community containers called **Diaspora Hubs**.
- **Map:** visualizes Hubs and verified geographic context; it should not invent neighborhood boundaries.
- **Stories:** content attached to a Hub; Stories are not the geographic container.

Recommended hierarchy:

`City → Diaspora Hub → Neighborhood → Spiral → Stories / Requests / Helpers`

GPS presence is a live operational signal. It does not automatically make a user a Hub member.

## Places in Stories → Diaspora Hubs

Yes. The product should move toward **Diaspora Hubs** as the durable geographic/community container while retaining **Stories** as the content stream.

Do not delete the existing Story concept or existing `hub_id` relationships. Rename/reframe the user-facing geographic layer rather than flattening the data model.

## Verification states

Use explicit states:

- `generated/discovery` — useful for finding candidate names; never GPS-active.
- `pending_review` — imported but awaiting human review.
- `verified` — reviewed, valid, provenance-backed, and eligible for GPS matching.
- `invalid` — rejected or geometrically invalid.

The green checkpoint means **verified geometry match**, not merely “Mapbox found a neighborhood name.”
