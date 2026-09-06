# Niakofa Spirals production recovery reference — 2026-09-06

## Inputs reviewed

This checkpoint was built from the uploaded issue notes and both uploaded
Mapbox archives:

- `Pasted--check-again-updated-new-repo-now-GitHub-Railway-Invest_1788673930196.txt`
- `Pasted-Push-landed-Fix-Some-checks-were-not-successful-4-succe_1788671535409.txt`
- `Pasted-Push-Landed-but-Host-signal-is-still-Blocked-The-Host-e_1788678778258.txt`
- `Niakofa-Spirals-Mapbox-Place-Fix-2026-09-06_1788673944734.zip`
- `spirals-mapbox-city-fix_1788673944734.zip`

The archives were extracted outside the repository and every text member was
reviewed before any source change. The first archive diagnoses the issue
correctly but its final `isAddressLikeFeature` guard hard-codes
`feature_type: "address"` and would reject every resolved city. The second
archive contains the corrected place/locality-only approach and tests the
actual exported reverse-geocoder.

## Repository recovery

The checked-out GitHub `origin/main` snapshot was not a complete application:
it contained generated `dist` output and only eight source files, while its
routes imported source modules that were absent. The complete monorepo baseline
was recovered from commit `c5109946`, which contains the full application,
production configuration, Spiral city resolution, and the corrected Mapbox
reverse-geocoder. The valid shared-GPS automation files were then restored
from the follow-up automation commit without importing its destructive
artifact-only tree.

## Product and privacy boundary

- Public product language is **Spirals**.
- Circle-era database tables, API paths, events, and links remain compatibility
  infrastructure; do not perform a blind table rename.
- Hosting is server-authorized by a fresh, accurate GPS fix and city match.
- Joining does not require GPS.
- Mapbox neighborhood output is an informational hint used to promote a
  matching local Spiral; it is not a verified neighborhood geofence.
- Raw coordinates are not persisted or written to the location audit log.

## Implemented production path

1. The shared AppContext GPS stream records source and capture time.
2. The Spirals page sends the same fresh GPS fix to the server location-context
   endpoint.
3. The server reverse-geocodes place/locality only, rejects address-as-city
   fallbacks, and returns a best-effort neighborhood hint.
4. A matching neighborhood Spiral is promoted to the top of the list.
5. The local Spiral renders one compact Host Signal check at the card's top
   right; the signal refreshes automatically and falls back to a fresh GPS fix
   when the shared stream is unavailable or stale.
6. The per-Spiral location check remains server-authoritative and fail-closed.

## Remaining deployment boundary

Railway production must be verified separately after the corrected source is
published: deploy the resulting commit, confirm the served commit matches it,
confirm `MAPBOX_TOKEN` is present on the production service without exposing its
value, and run authenticated Fort Worth and outside-city location checks.
The application must continue to deny hosting when Mapbox cannot resolve a
place/locality or when the GPS fix is stale/inaccurate.