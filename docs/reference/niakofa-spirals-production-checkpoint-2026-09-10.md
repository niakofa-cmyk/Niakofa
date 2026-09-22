# Niakofa Spirals — Production Checkpoint

Date: 2026-09-10

## Current architecture

- Canonical user-facing feature: **Niakofa Spirals**.
- Canonical public paths: `/audio-spirals`, `/audio-spiral/:id`.
- Circle-era API/storage identifiers remain compatibility internals.
- Spiral discovery is curated and manually selectable.
- A configured city exposes one city-wide Spiral and up to nine curated neighborhood suggestions.
- GPS, Map Locator, reverse geocoding, and neighborhood geometry are not Spiral discovery or hosting dependencies.
- Joining remains location-independent.
- Host Signal is a non-location product-state indicator; media readiness is separate.
- Nia remains a separate service boundary and must not block core Spiral availability.
- Historical GIS tables/migrations remain available for compatibility and reference; they no longer gate core Spiral availability.

## Fort Worth launch catalog

The original nine Niakofa product neighborhoods are preserved:

1. Southside
2. Near Southside
3. Polytechnic
4. Riverside
5. Downtown
6. East Fort Worth
7. North Fort Worth
8. Stop Six
9. Wedgwood

## Implemented in this checkpoint

- `artifacts/pay-it-forward/src/lib/spirals.ts` now includes city-wide rows and curated neighborhood rows, ignores geometry verification for discovery, and preserves stable server order instead of GPS promotion.
- `artifacts/pay-it-forward/src/components/SpiralHostSignal.tsx` no longer reads browser location, Map Locator state, or calls the location-check endpoint.
- `artifacts/api-server/src/lib/circleLocationPolicy.ts` no longer makes GPS/reverse-geocode verification a Spiral hosting requirement; the legacy entry point remains compatible while accepting an optional legacy location payload.
- Spiral location-policy tests were replaced with location-independent acceptance tests.
- Curated Spiral architecture is documented in `docs/reference/niakofa-spirals-curated-location-independent-architecture.md`.

## Verification status

GitHub `main` contains the implementation commits for this checkpoint. The latest checked commit before this documentation update was `4194104a43294fdd60f4dc6cf4223445927a4eca`.

GitHub currently reports a pending Railway status for the latest commit. This session did not independently execute the Railway deployment or production smoke tests, so production health is **not claimed green**.

## Remaining acceptance gate

Run the deployed acceptance against the actual Railway origin before production certification:

- `/api/readiness` ready;
- `/api/audio-spirals` returns city-wide plus the curated neighborhood catalog without location permission;
- neighborhood selection opens the correct Spiral;
- host can start without GPS/Map Locator;
- join works without GPS/Map Locator;
- no Spiral discovery/start request depends on geometry verification;
- LiveKit room lifecycle remains healthy;
- Nia remains nonblocking for core Spiral discovery and joining.
