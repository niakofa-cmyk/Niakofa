# V21 resumable upload and camera-clip composition certification

This is a deliberately gated, mutating acceptance run. It uploads two short,
locally generated synthetic MP4 clips, briefly publishes a Story, requests a
camera-clip composition, checks private byte-range playback, and deletes the
Story and source assets. The Story has no mentions or audience tags; while it
exists, it is visible to its normal Community audience and may produce the
platform's normal realtime Story-created event. Do not use accounts or a
Community where even that temporary visibility is inappropriate.

## Prerequisites

- The V21 production feature flag must already be deliberately activated.
  The spec checks `/api/healthz` for `media_platform_flag`,
  `cloud_configured`, and `credentials_present`, checks `/api/readiness`, and
  checks `/api/version` against the exact full `EXPECTED_COMMIT` before its
  first write. An inactive flag fails preflight; the test does not enable it.
- `BASE_URL` must be the deployed HTTPS origin, with no path, query, fragment,
  username, or password. `EXPECTED_COMMIT` must be the full 40-character
  served release commit.
- `USER_A_STATE` and `USER_B_STATE` must name two distinct, approved,
  disposable-account Playwright storage-state files. Each file must be
  outside the repository, a regular non-symlink file, and exactly mode 0600.
  USER_B must also have a different `community_id` from USER_A (including a
  different null/non-null value), so this Community-audience Story can be
  expected to deny USER_B rather than accidentally certifying normal audience
  access.
  Create/validate them using the existing approved media certification-state
  process (`ops/build-media-certification-states.mjs`) and keep their private
  parent directory mode 0700. The runner accepts paths only, never state JSON
  environment variables.
- Install the repository's Playwright dependencies and provide local `ffmpeg`.
  No credentials or tokens should be placed in command arguments or output.
- The owner identity and `community_moment` context are derived exclusively
  from USER_A's approved state. The runner discards legacy arbitrary
  `MEDIA_SMOKE_CONTEXT_KIND` / `MEDIA_SMOKE_CONTEXT_ID` values.

## Explicit production authorization

Only after the prerequisites and cleanup plan are confirmed, set each of these
to exactly `1` for the operator invocation:

```text
ALLOW_MEDIA_PRODUCTION_E2E=1
CONFIRM_DISPOSABLE_ACCOUNT=1
CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE=1
MEDIA_PLATFORM_V21_BROWSER_SMOKE=1
```

Then invoke `bash ops/run-media-v21-resume-compose-certification.sh` with
`BASE_URL`, `EXPECTED_COMMIT`, `USER_A_STATE`, and `USER_B_STATE` in the
environment. The runner validates gates, URL, state-file permissions, and
state shape; its private temporary Playwright output directory is created
outside the repository, copies the validated state files into that 0700
directory as mode-0600 files, and removes the copies and test output by an exit
trap. It does not enable a feature flag, create credentials, or print
storage-state contents.

`bash ops/run-media-v21-resume-compose-certification.sh --list` only asks
Playwright to enumerate the spec; it does not require production gates or
make HTTP requests. Do not invoke the normal runner unless this production
write is explicitly approved.

## Cleanup behavior and limits

The spec reloads the first upload's acknowledged offset in a new API request
context and resumes from that byte; it never restarts the accepted prefix.
The `finally` cleanup deletes a discovered Story first, retries while media
processing is in flight, deletes each known source asset, verifies inaccessible
resources return 404, and removes local synthetic files. An incomplete cleanup
is a hard failure with an explicit `CLEANUP INCOMPLETE` message; stop further
certification and have an operator resolve it before retrying.

As with any remote HTTP mutation, a lost response before the service returns a
new upload-asset ID or a persistent infrastructure/storage failure can prevent
automated cleanup from proving completion. The acceptance spec stops and
reports cleanup uncertainty rather than claiming success. Do not start a run
unless an operator is available to resolve that exceptional case.