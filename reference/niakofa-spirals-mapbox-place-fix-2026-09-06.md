# Niakofa Spirals — Mapbox place-only reverse-geocode fix

**Date:** 2026-09-06
**Source material:** the two uploaded Mapbox/Spirals ZIP packages and the attached production check reports.

## Problem confirmed before the fix

Mapbox Geocoding v6 can rank a rooftop address before its administrative
hierarchy. Treating the first feature as the city produces values such as
`170_east_3rd_street`, so a user physically in Fort Worth is incorrectly
blocked from hosting a Fort Worth Spiral.

## Production-safe behavior

- A city is resolved only from a `place` or `locality` feature, including those
  types nested in Mapbox `properties.feature_type` or `place_type`.
- If no direct city feature exists, a `place`/`locality` context is used.
- Address, street, and house-numbered labels are never accepted as cities.
- If no real city can be resolved, verification fails closed with
  `CIRCLE_START_LOCATION_UNVERIFIED`.
- Neighborhood data from Mapbox remains an informational hint. It is not a
  neighborhood geofence because `city_neighborhoods` has no boundary geometry.
- Hosting remains city-authorized; joining remains available without GPS.
- User-facing language remains **Spirals**. Circle-era API/storage identifiers
  remain compatibility contracts and are intentionally not renamed.

## Verification coverage

The API policy tests cover:

1. An address ranked first with a Fort Worth place context.
2. A bare address with no city context, which must fail closed.
3. A Mapbox v6 place type nested under `properties`.
4. A genuine outside-city response and Fort Worth enclave aliases.

## Deployment acceptance checklist

After the changes are pushed and deployed:

1. Confirm the production service has `MAPBOX_TOKEN` configured without exposing
   its value.
2. POST a fresh Fort Worth GPS fix to
   `/api/audio-spirals/:id/location-check` and expect `can_host: true` with a
   city display of `Fort Worth`.
3. POST a genuinely outside-city fix and expect a blocked host signal naming the
   resolved city.
4. Confirm the same outside-city user can still join a live Spiral.
5. Confirm `/api/version` and readiness report the deployed commit.