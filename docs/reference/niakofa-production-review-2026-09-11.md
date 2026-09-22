# Niakofa production review — 2026-09-11

## Source reviewed

This review used the verified GitHub `main` checkout at
`947151a118a4bda6d33f1fda366206466dfcee54` and the supplied
production-readiness notes. The current session included three text references;
no additional ZIP was attached. Existing checked-in reference archives remain
available under `docs/reference/uploads/` and were not copied into the runtime
or used as a deployment source.

The uploaded notes and archive remain local review inputs under
`attached_assets/`; they are ignored by Git and are not copied into the public
repository. No credential values, storage state, or private user data were
imported.

## Changes carried forward

- `/audio-circles/followed` now selects `neighborhood_slug`, so followed
  curated Fort Worth Spirals remain visible even when their legacy
  `source_kind` was produced by the GIS import.
- The API audio-circles test reset now clears the full mocked query chain,
  preventing an early authorization response from leaking a queued mock into
  the next test.
- The client Spiral ordering tests now assert the location-independent
  contract: curated neighborhoods plus one city-wide Spiral, stable server
  order, no GPS promotion, and no geometry gate.

The existing curated Spirals architecture remains intact: one city-wide Spiral
and up to nine manually selected neighborhoods per configured city; GPS, Map
Locator, reverse geocoding, and neighborhood geometry are not prerequisites for
discovery, joining, or hosting. LiveKit remains the production media boundary.

## Latest verification evidence — 2026-09-11

- GitHub `main` was independently read through the connected GitHub API and
  matched the local checkout at `947151a118a4bda6d33f1fda366206466dfcee54`.
- The local web preview rendered the Niakofa sign-in landing page cleanly; the
  `/audio-spirals`, `/audio-spiral/:id`, and `/status` SPA routes returned 200.
- Root typecheck, API typecheck, client typecheck, ESLint, production build,
  API tests (47 suites / 391 tests), and client tests (62 suites / 513 tests)
  passed locally.
- Both `https://niakofa.com` and the Railway origin returned healthy API
  responses with connected database and ready dependency status.
- The public deployment currently serves
  `1c822723abfede1fa03dfc7c4065cc66647f2931`, while GitHub `main` is
  `947151a118a4bda6d33f1fda366206466dfcee54`. This is a stale rollout, not an
  application health failure.
- `https://niakofa.com` is the confirmed canonical product host and should be
  the deployment-verification target. Updating `.github/workflows/deploy-verify.yml`
  was not published because the connected GitHub token lacks workflow-path
  write permission; the exact served-commit parity gate was not weakened.

Production deployment certification remains a separate gate requiring the
canonical host to converge to the current commit, authenticated Spiral
discovery/start/join checks, and real-device LiveKit evidence. This review does
not claim those external checks are complete until that rollout converges.