# Niakofa Spirals — Production Checkpoint

Date: 2026-09-06

## Current repository baseline

`origin/main` is currently **`750c409585a14f77c44c7f86286cbaf13967eff3`** (`Remove retired RPG runtime references and assets`). PR #35 (`fix: close Spiral GPS host-signal type boundary`) is merged; its merge commit is `f0216be3af97de289c5fe1cf43697b49f44bfd5f`.

## Canonical product language

Niakofa's user-facing live community feature is **Niakofa Spirals 🌀**. Canonical routes are `/audio-spirals` and `/audio-spiral/:id`.

Circle-era API/storage identifiers remain compatibility internals. Do not perform a blind database rename while active sessions and legacy clients depend on those identifiers.

## Host versus join policy

- **Host/start:** requires a fresh server-authoritative GPS check for the Spiral's city.
- **Join:** does not require host-location eligibility; users may join from other locations.
- A Fort Worth Spiral therefore cannot be hosted from Dallas/Kansas City/etc., but it can be joined from those locations.
- Fort Worth enclave aliases are narrowly supported so a physically Fort Worth-area fix is not rejected merely because Mapbox names an incorporated enclave.

## GPS failure history

The original production `Can't start the Spiral — Niakofa can't verify your current location` failure came from an invalid Mapbox reverse-geocoding request: the old v5-style `limit` + multi-type filter was being sent to the v6 reverse endpoint and Mapbox returned HTTP 422. The current location policy uses the v6 reverse endpoint and fails closed when reverse geocoding is unavailable.

PR #35 closed a separate TypeScript union-boundary failure in `circle-location.ts`: the route was attempting to read `spiralCityDisplay` from a successful verifier branch where that property was not exposed. The response now uses persisted Spiral metadata as the authoritative display value.

## Neighborhood semantics

`city_neighborhoods` is currently a neighborhood catalog, not a geographic boundary dataset. It does not contain authoritative polygon/radius geometry for per-neighborhood geofencing.

Therefore the current host signal intentionally distinguishes:

- **Verified host city:** authoritative for hosting.
- **Spiral neighborhood identity:** identifies which neighborhood room is being hosted.
- **GPS-resolved neighborhood hint:** informational reverse-geocode context only.

The UI must not claim that a user is inside a verified neighborhood boundary until authoritative neighborhood geometry exists.

## True neighborhood-hosting next phase

Add reviewed polygon/radius geometry, source/version metadata, effective dates, and verification state to neighborhood records. The server should resolve a fresh GPS fix against that authoritative geometry and return a neighborhood verification status. Missing or stale geometry must fail closed rather than guessing.

## Production verification already completed

- Mapbox v6 reverse-geocode correction merged.
- Fort Worth host-fence/enclave behavior covered by the location policy tests.
- County travel acceptance passed.
- Railway deployment verification for the current `main` SHA passed.
- LiveKit server readiness previously reported authenticated reachability.
- Stripe live configuration and 30-day reconciliation previously returned zero missing ledger entries and zero missing financial events.

## Remaining release gates

Do not call the Spiral media path fully device-certified until a real browser/device test confirms:

1. Fresh location permission succeeds in Fort Worth.
2. A Fort Worth Spiral location-check returns `can_host: true` and a clear `Verified:` host signal.
3. A genuinely outside-Fort-Worth location receives a blocked host signal showing the resolved city and required Spiral city.
4. The outside-city user can still join the Spiral.
5. Two browser/device clients connect through LiveKit and exchange microphone audio.

These are physical-device acceptance gates, not things repository inspection can honestly substitute for.
