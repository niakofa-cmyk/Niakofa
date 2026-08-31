# Niakofa Census coverage verification — August 31, 2026

## Source decision

Niakofa keeps Census as an optional authoritative geography enrichment source.
It is not a replacement for Mapbox geocoding or the civic resource registry.
BLS and third-party civic assistants are complementary providers, not
substitutes for Census geography and GEOIDs.

## Runtime behavior

- With `CENSUS_API_KEY`, the coverage seed loads national county names and
  state/county FIPS values from the Census 2025 PEP population dataset.
- It separately loads Texas Census places into `civic_jurisdictions` with
  `coverage_status = needs_verification`.
- Census places do not create civic-resource URLs or city matches by name.
- A missing key, provider error, HTML response, or malformed table leaves the
  verified 254-county Texas fallback active and skips unverified places.
- Location resolution remains fail-closed when Mapbox cannot confidently
  identify a state/county/city.

## Verification

Run the deterministic parser/fallback checks:

```bash
pnpm --filter @workspace/scripts run test:census
```

Run a read-only live provider check using the workspace secret:

```bash
pnpm --filter @workspace/scripts run verify:census
```

The live command prints only row counts and verified FIPS facts. It never
prints the key or a URL containing the key. A missing key reports `degraded`
because national enrichment is optional; it does not disable safe Texas
coverage.

On August 31, 2026, the configured development secret was tested once by the
live check and Census returned its key-error redirect (`invalid_key.html`).
The application therefore correctly fell back to the verified Texas county
baseline and did not insert unverified Texas places. Replace or revoke that
secret with a valid Census key before expecting national enrichment.

## Operational boundary

`CENSUS_API_KEY` belongs in Replit Secrets and must not be copied into source,
reference files, shell history, or GitHub. Before any public-repository sync,
scan staged text for credential-shaped values and keep provider credentials
outside the repository.