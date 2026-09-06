# Niakofa Spirals — Production Checkpoint

**Date:** 2026-09-06
**Product term:** Niakofa Spirals 🌀
**Compatibility boundary:** legacy Circle API/storage identifiers remain supported intentionally.

## Verified repository baseline

The repository was reviewed from current `main` at `d1f3e8e4aeb671bca9a3598839d4b5ed8a916cf2` and the current Spiral host-signal fix is tracked in PR #35.

## Branding decision

User-facing product language is **Spirals**. New URLs use `/audio-spirals` and `/audio-spiral/:id`. Legacy `/audio-circles` and `/audio-circle/:id` aliases remain so existing links and deployed clients do not break.

Do **not** blindly rename database tables, migrations, persisted columns, or API identifiers such as `audio_circles`. Those identifiers are compatibility contracts until a separately planned database/API migration is approved.

## GPS hosting policy

1. Hosting is server-authorized from a fresh high-accuracy GPS fix.
2. A Spiral is hostable when the GPS-resolved city matches the Spiral's city policy.
3. Joining a live Spiral does not require GPS.
4. Fort Worth enclave aliases are explicitly supported without opening Fort Worth hosting to other cities.
5. Mapbox Geocoding v6 reverse lookup is used; the old v5 `limit` + multi-type combination is not used.
6. Location denials expose the Spiral city and resolved GPS city so the UI can explain the decision.
7. The host signal may show Mapbox's neighborhood result as a **GPS neighborhood hint**.

## Neighborhood boundary truth

`city_neighborhoods` currently stores names/content and verification state, but it does not contain geographic boundary polygons or lat/lng/radius fields. Therefore Niakofa must not claim that a neighborhood is GPS-geofenced today.

The current safe product behavior is:

- **Verified city host signal:** authoritative for hosting.
- **Neighborhood Spiral identity:** identifies which neighborhood room is being hosted.
- **GPS neighborhood hint:** informational reverse-geocode context only.

A future true neighborhood host gate requires reviewed geofence data (preferably polygons) per neighborhood, plus a migration, seed data, tests, and an explicit product decision.

## Production acceptance evidence already completed

- Spiral GPS Mapbox v6 fix merged/deployed previously.
- County travel acceptance passed.
- Railway health/readiness returned 200 on the current production deployment.
- LiveKit server readiness reported authenticated reachability.
- Stripe live configuration was verified and 30-day reconciliation returned zero missing ledger entries and zero missing financial events.

## Current known checkpoint issue

The current main push introduced a TypeScript union-boundary failure in `circle-location.ts`: the route attempted to read `spiralCityDisplay` from a successful verifier branch that did not expose that property. PR #35 removes that type leak and anchors the response to persisted Spiral metadata.

## Release gate

Do not declare the release fully certified until:

- PR #35 CI is green.
- PR #35 is merged to main.
- Railway production deploys the resulting main SHA.
- Production `/api/version` and readiness report that SHA.
- A real Fort Worth device location-check returns `can_host: true` for a Fort Worth Spiral.
- A genuinely outside-Fort-Worth location receives a clear blocked host signal but can still join a live Spiral.
- Two-browser/device LiveKit audio is tested end-to-end.

## Reference files

The repository contains earlier Circles/RTC references for historical implementation details. Those remain useful provenance documents; this checkpoint is the authoritative naming and GPS-policy handoff for the Spirals migration.
