# V21 resumable upload and camera-clip composition certification

This is a deliberately gated, mutating acceptance run. It uploads two short,
locally generated synthetic MP4 clips, briefly publishes a Story, requests a
camera-clip composition, checks private byte-range playback, verifies the
owner's Moments feed and item-specific share link in Chromium, checks that a
viewer from another Community cannot see that Moment in the feed, and deletes
the Story and source assets. The Story has no mentions or audience tags; while
it exists, it is visible to its normal Community audience and may produce the
platform's normal realtime Story-created event. Do not use accounts or a
Community where even that temporary visibility is inappropriate.

The share-sheet browser check validates the exact copied link and its audience
scope. It intercepts the test Story's view/share-counter and playback-grant
requests and opts out of analytics, avoiding persistent view/share counts,
notifications, or analytics events. Actual owner playback and cross-Community
playback denial are verified separately through production API requests.

## Prerequisites

- The V21 production feature flag must already be deliberately activated.
  The spec checks `/api/healthz` for `media_platform_flag`,
  `cloud_configured`, and `credentials_present`, checks `/api/readiness`, and
  checks that readiness explicitly requires the `media-processing` worker and
  reports its bounded BullMQ `waitUntilReady()` check successful. It also
  checks `/api/version` against the exact full `EXPECTED_COMMIT` before its
  first write. An inactive flag fails preflight; the test does not enable it.
  With V21 enabled, API readiness fails closed if that worker is missing,
  cannot establish its initial Redis connection, or reports a connection
  error/closure; Redis configuration alone is not sufficient.
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

### Same-Community narrow run

If the only approved disposable viewer is in the **same** Community as the
owner, the default runner must continue to refuse cross-community
certification. An explicitly limited run is available with `--narrow` and
`CONFIRM_SAME_COMMUNITY_NARROW=1` in addition to every production gate above.
It requires USER_B to share USER_A's Community, verifies that the authorized
same-Community viewer can get a composition and private playback grant, and
still checks that anonymous access without a grant is denied. It exercises
the same resumable upload, processing, composition, owner byte-range playback,
and exact-ID cleanup. It **does not** establish cross-community privacy,
Exchange Spark isolation, or Family Story media playback. The normal runner
remains the required check when an approved outside-Community viewer is
available.

The opt-in `community-media-api-runtime.integration.test.ts` creates two
approved *fixture* users in separate fixture Communities in a migrated,
isolated local test database. It checks Community Story, media authorization,
Exchange Spark visibility, and Family membership policy without real media
bytes or production identities. Set `COMMUNITY_MEDIA_API_RUNTIME_TEST=1` and
`NODE_ENV=test` only against a disposable database whose name includes `test`
or `dev`; the API Jest setup also requires
`FAMILY_STORY_RUNTIME_TEST_DATABASE_URL` to point at that database. This
local regression is not evidence of production video processing or privacy.

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

The readiness worker status comes from the API's in-process worker registry.
It is a BullMQ registration/Redis-connectivity signal: it proves initial
`waitUntilReady()` succeeded and tracks BullMQ error, close, and reconnect
events, but it is not proof that a job was consumed or successfully processed.
The acceptance flow separately verifies completed media status for both
uploads and successful composition before it passes.

## Diagnosing resumable chunk 503s

The public response remains the generic `MEDIA_STORAGE_UNAVAILABLE` error so
clients do not receive provider or database details. The API log records only
two fixed values: the operation stage (`database_validate`, `database_ledger`,
`database_lock`, `storage_put`, or `database_commit`) and a fixed
`failure_class`. It does not log the underlying exception, SQL text, account or
asset IDs, object keys, chunk bytes, or request payload.

Use the stage first: `storage_put` isolates the object-store operation;
database stages isolate the corresponding SQL transaction. The class then
distinguishes bounded groups such as storage authorization, timeout,
throttling, upstream failure, network failure, or provider-unknown; and
database connection, constraint, authentication, schema, transaction,
operator, query, or unknown failures. Do not retry production media writes
until the release with this classifier is served and the observed class has
been reviewed. A classification is diagnostic evidence, not proof that a
later upload or playback succeeds.