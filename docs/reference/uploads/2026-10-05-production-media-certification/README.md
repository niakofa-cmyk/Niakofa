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

- At the original October 5 verification, the served application commit was
  `517e2d3c71c3bcb1580bf0886eeaee5d43a5d0f0`.
- V21 was enabled by the user's explicit direction. Production health and
  readiness returned HTTP 200; readiness was true, and cloud storage, schema,
  Redis, and the media worker were ready.
- Production photo and video certification flows previously passed with V21
  enabled. The existing test photo, Story, and source clips remain intact; no
  existing test media was deleted during the later flag enablement.
- The separate one-off PUT/HEAD/GET/DELETE storage probe has not been run. Its
  result must not be inferred from the authenticated media-flow tests.

## October 6 read-only deployment refresh

- Railway's production API service `zesty-ambition` was online with no pending
  work or recent failures. Its active deployment
  `197c8ae1-855e-47a1-aba5-246cdea0b55d` reported `SUCCESS`.
- The canonical `/api/version` response served commit
  `ba6bb481889134b7f3e45bdbc8af6a7938b36508`. `/api/healthz` and
  `/api/readiness` both returned HTTP 200.
- GitHub's Release Validation, ESLint, Typecheck + Tests, App/AI Boundary Check,
  and Verify Production Deployment checks all completed successfully for that
  commit.
- Readiness was `ready: true`; database/schema, Redis/BullMQ, cloud storage, and
  the media worker all reported ready. Health reported
  `media_platform_flag: true`, consistent with the recorded user-directed V21
  activation.
- No Railway variable was changed, and no production upload, storage probe, or
  media mutation was run during this read-only verification. The standalone
  storage probe remains outstanding; this refresh does not repeat the prior
  photo/video acceptance flows.

See [`../../../PRODUCTION_MEDIA_ACTIVATION_GATE.md`](../../../PRODUCTION_MEDIA_ACTIVATION_GATE.md)
for the ordered activation criteria and the remaining verification gaps. The
synthetic visual fixture is documented in
[`../../niakofa-community-media-fixture.md`](../../niakofa-community-media-fixture.md).
