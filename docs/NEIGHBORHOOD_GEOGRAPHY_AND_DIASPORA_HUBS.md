# Neighborhood Geography + Diaspora Hub model

## Decision

Niakofa should not ask an LLM to be the authority for neighborhood names or
boundaries. LLM generation is useful for **discovery hints** only.

For GPS verification, host eligibility, neighborhood Spiral ordering, map
placement, and neighborhood presence, Niakofa needs reviewed geometry and
provenance.

### Source priority

1. Municipal GIS — preferred.
2. County GIS — preferred when the city does not publish a suitable layer.
3. State/regional public GIS — fallback.
4. Reviewed OpenStreetMap neighborhood/place geometry — useful secondary source.
5. Niakofa-curated geometry — allowed after explicit review and provenance.
6. LLM-generated names — discovery only; never a GPS boundary.

The U.S. Census TIGER/Line program is excellent for legal/statistical
geographies, but neighborhoods are not a universal Census geography. Use it
for city/county/block/statistical context, not as an automatic neighborhood
boundary source.

## Launch-city source directory

### Fort Worth, Texas

The City of Fort Worth publishes GIS data and interactive maps and supports
public GIS-data downloads. Start with the city's GIS program, then select and
review the exact neighborhood/community boundary layer before importing it.

Source discovery: https://www.fortworthtexas.gov/departments/it-solutions/gis

The current Niakofa launch catalog contains these nine curated names:

- Southside
- Near Southside
- Polytechnic
- Riverside
- Downtown
- East Fort Worth
- North Fort Worth
- Stop Six
- Wedgwood

These are Niakofa's current product neighborhoods, not a claim that Fort
Worth officially recognizes exactly nine municipal neighborhood boundaries.
The product should keep that distinction explicit until GIS review is done.

### Kansas City, Missouri

Kansas City, Missouri publishes a public **Kansas City Neighborhood
Boundaries** dataset through its Open Data portal. This is the preferred
starting point for the city's neighborhood geometry and names.

Source discovery: https://data.kcmo.org/Neighborhoods/Kansas-City-Neighborhood-Boundaries/q45j-ejyk

Do not copy a fixed number of Kansas City neighborhoods into application code.
Import the reviewed source rows and let the city determine the available list.

## Data model

Each `city_neighborhoods` row now records:

- `source_kind` — municipal/county/state/regional GIS, reviewed OSM, curated,
  or generated hint.
- `source_publisher`
- `source_url`
- `source_license`
- `source_retrieved_at`
- `source_version`
- `authority_level` — authoritative, curated, or generated.
- existing geometry provenance (`geometry_source`, `geometry_version`,
  `geometry_effective_at`) and `geometry_verified`.

A row cannot become GPS-verified while its geometry is marked generated or its
source provenance is missing.

## How the GPS → Spiral experience should work

1. User requests a fresh pinpoint GPS fix.
2. Server resolves the city.
3. Server tests the point against **reviewed, effective neighborhood geometry**
   for that city.
4. If a verified neighborhood matches, show the green **Host Signal · green
   GPS neighborhood checkpoint**.
5. Promote that neighborhood's Spiral to the top of the list.
6. Keep other neighborhood Spirals below it, followed by the city-wide Spiral.
7. If the city is known but neighborhood geometry is unavailable, show an
   amber/pending state and do not guess.
8. Joining a Spiral never requires GPS. Hosting does.
9. Never expose the user's raw coordinates in the public village-pulse or
   Spiral discovery response.

This makes the same behavior work for Fort Worth, Kansas City, Missouri, and
future cities without city-specific frontend logic.

## Diaspora Hubs vs. Places in Stories

**Yes: use Diaspora Hubs as the geographic/community container.** Do not delete
or flatten the Story concept.

Recommended hierarchy:

`City → Diaspora Hub → Neighborhoods → Spirals → Stories / Requests / Helpers`

A Story can have a `hub_id`, while a neighborhood Spiral is tied to the local
city/neighborhood. A Hub is the durable community node on the Globe/Map; a
Story is content that lives within that node.

The Globe should therefore label the geographic pins/cards as **Diaspora Hubs**
and use Stories as a content stream inside a selected Hub. GPS presence is a
live operational signal, not automatic Hub membership.

## Collection pipeline for every new city

1. Discover the city's official GIS/open-data portal.
2. Select a neighborhood/community boundary dataset.
3. Record the publisher, source URL, license, retrieval date and dataset
   version.
4. Normalize names and stable IDs.
5. Load geometry into `city_neighborhoods`.
6. Validate topology and point-in-polygon behavior.
7. Admin-review the imported list.
8. Mark geometry effective and verified.
9. Generate the city's neighborhood Spirals from those rows.
10. Only then enable green neighborhood Host Signal eligibility.

OpenStreetMap can fill gaps, but its neighborhood tags explicitly allow cases
where boundaries are uncertain. A reviewed OSM boundary is therefore a useful
secondary source, not an excuse to infer a boundary from a geocoder label.
