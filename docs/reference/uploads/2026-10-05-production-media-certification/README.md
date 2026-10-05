# Production media certification reference

**Reviewed:** October 5, 2026

This note preserves the useful requirements from the uploaded production-media
certification documents without copying local authentication-state paths or
credentials. Four text uploads were reviewed: one bucket-wiring request and
three byte-identical copies of the Playwright bucket-workflow note. The original
uploads and the MP4 remain untouched in workspace attachment storage; the MP4
is not copied into GitHub.

## Certification wiring

- The production Playwright runner can retrieve User A's approved state from
  the existing private Railway object-storage bucket when an explicit privacy
  confirmation is supplied.
- The bucket helper restricts operations to the approved state object, checks
  that the certification target matches the API's configured bucket and
  endpoint, writes downloads to a private file, and does not print state
  contents.
- A distinct approved User B state is still required for two-account isolation
  certification. The User A bucket path does not replace that requirement.
- The runner has explicit production, account, V21, private-bucket, and media
  retention gates. Its contract tests exercise those restrictions without
  accessing production state.

The corresponding implementation is in `ops/railway-bucket-object.mjs` and
`ops/run-media-production-certification.sh`. The Railway-backed command is
`pnpm test:media-production:railway`; do not run it unless the approved states,
production gates, and media-retention behavior are intentionally set.

## Production evidence

- The currently served application commit is
  `517e2d3c71c3bcb1580bf0886eeaee5d43a5d0f0`.
- V21 is enabled by the user's explicit direction. Production health and
  readiness returned HTTP 200; readiness was true, and cloud storage, schema,
  Redis, and the media worker were ready.
- Production photo and video certification flows previously passed with V21
  enabled. The existing test photo, Story, and source clips remain intact; no
  existing test media was deleted during the later flag enablement.
- The separate one-off PUT/HEAD/GET/DELETE storage probe has not been run. Its
  result must not be inferred from the authenticated media-flow tests.

See [`../../../PRODUCTION_MEDIA_ACTIVATION_GATE.md`](../../../PRODUCTION_MEDIA_ACTIVATION_GATE.md)
for the ordered activation criteria and the remaining verification gaps. The
synthetic visual fixture is documented in
[`../../niakofa-community-media-fixture.md`](../../niakofa-community-media-fixture.md).
