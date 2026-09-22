# Niakofa Spirals — Curated, Location-Independent Architecture

**Effective:** 2026-09-10

## Product contract

Niakofa Spirals are manually selectable community spaces. A user can discover,
join, and host a Spiral without GPS, Map Locator, reverse geocoding, or
neighborhood geometry.

Each configured city exposes:

- one city-wide Spiral
- up to nine curated neighborhood suggestions
- stable catalog order

Legacy Circle routes and GIS data remain available for compatibility/history,
but they are not a prerequisite for Spiral discovery or hosting.

## Fort Worth launch catalog

The original Niakofa product catalog is preserved as the nine curated
neighborhoods:

1. Southside
2. Near Southside
3. Polytechnic
4. Riverside
5. Downtown
6. East Fort Worth
7. North Fort Worth
8. Stop Six
9. Wedgwood

These are product/community destinations, not claims about official municipal
boundary definitions.

## Architecture rules

1. Discovery must not require a Map Locator fix.
2. Discovery must not require `geometry_verified`.
3. Discovery must not use point-in-polygon or geofence state.
4. Discovery must not promote a Spiral from GPS-derived proximity.
5. Host Signal must not initiate location capture or location checks.
6. Hosting must not fail because GPS is unavailable.
7. Joining remains location-independent.
8. LiveKit/media behavior remains unchanged.
9. Nia remains a separate service boundary and is never required to browse or
   join a Spiral.
10. Existing GIS tables/migrations are retained temporarily for compatibility
    and historical operations; they are not deleted merely because Spirals no
    longer depend on them.

## Compatibility

The Circle-era database identifiers and REST paths can remain internally while
`/audio-spirals` and `/audio-spiral/:id` remain the canonical public routes.

This separation allows the community product to be resilient even when GIS,
Mapbox, browser location permission, or Map Locator services are unavailable.
