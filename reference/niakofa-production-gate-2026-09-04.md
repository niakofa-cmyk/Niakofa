# Niakofa Production Gate Reference — 2026-09-04

This reference captures the actionable guidance from the supplied production-gate
bundle and the verified state of this repository. The uploaded bundle's claims
about a separate Diaspora repository, pull request numbers, and commit hashes are
not used as evidence for this app; repository and CI state must always be checked
against `origin/main`.

## Verified application boundary

- The canonical product source is the Niakofa monorepo under `artifacts/`.
- The core app is the map-first mutual-aid platform: help requests, helpers,
  Community Pool, Stripe, Mapbox, civic resources, and Circles.
- The repository also contains a separate Diaspora/Family experience. Its DNA
  matching boundary remains explicit:
  - sketch-derived results are discovery leads only;
  - provider-grade shared-cM/IBD is unavailable until independently sourced and
    validated;
  - no fabricated centimorgan values, synthetic people, or implied partner
    network coverage.

## Community assignment contract

Registration and later GPS updates may resolve a user's community from a fresh
latitude/longitude fix. If reverse geocoding fails or no configured community
matches the county/state, the user stays in the `NULL` global bucket rather than
silently inheriting the administrator's default community. A user already
resolved to a real community is not geocoded again on every location ping.

The OpenAPI source and generated server/client types must stay synchronized:

```bash
corepack pnpm --filter @workspace/api-spec run codegen
```

## Verification sequence

Run these checks from the repository root:

```bash
corepack pnpm run typecheck
corepack pnpm --filter @workspace/api-server run test
corepack pnpm exec eslint . --max-warnings 0
corepack pnpm run boundary-check
corepack pnpm run release-validate
corepack pnpm run test:production-gate
```

For a deployed Diaspora experience, use the supplied Chromium journey only with
approved disposable accounts and authenticated staging state. Mutating tests
must remain opt-in; production completion must never depend on enabling
provider-grade DNA or on treating sketch similarity as relationship proof.

## Source materials reviewed

- `GLOBAL_VILLAGE_REBRAND.md`
- Community Pool geo-resolution patch and fresh-location test
- Diaspora production-gate ZIP: DNA boundary, Chromium journey, post-deploy smoke,
  and contract-runner guidance
