# Deployed acceptance operations

Run deployed acceptance only through `ops/run-deployed-acceptance.sh`. It requires:

- `BASE_URL` and matching `NIAKOFA_API_ORIGIN` HTTPS origins;
- `EXPECTED_COMMIT`, `ALLOW_MUTATING_E2E=1`, and `CONFIRM_DISPOSABLE_ACCOUNT=1`;
- `ALLOW_COUNTY_TRAVEL_E2E=1` for the separately gated location-mutating test;
- approved, distinct authenticated User A and User B Playwright storage states.

The requester/helper arrival acceptance is a separate opt-in mutation gate. To
run it, also set `ALLOW_REQUEST_ARRIVAL_E2E=1`. It creates a disposable
goodwill request with User A, claims and advances it with User B, verifies the
requester and helper arrival cards in separate browser contexts, and cancels
the request in cleanup. User B is required for this gate.

Pass a pre-existing state with `USER_A_STATE` / `USER_B_STATE` only when each is
an untracked, non-symlink regular file outside the repository and mode `0600`.
For User A, deployment operators may instead place the JSON state in the
`USER_A_STATE_JSON` secret. The runner creates a `0600` file in a private
runtime temporary directory, exports its path only to its child processes, and
removes it on exit. Never echo, log, or commit storage-state JSON. The only
permitted upload path is the separately gated helper for the private Railway
bucket described below.

Generate state for an existing approved disposable test account. Prefer the
interactive password prompt so the password is not placed in the command line,
environment, or shell history:

```sh
BASE_URL="https://staging.example" \
DISPOSABLE_EMAIL="<existing-approved-test-account-email>" \
PROMPT_PASSWORD=1 CONFIRM_DISPOSABLE_ACCOUNT=1 \
OUT="$HOME/niakofa-playwright/niakofa-state.json" \
node ops/generate-user-a-state.mjs
```

The terminal prompts for the password without echoing it. No new account or
account-ID change is part of this flow. Use the established password-reset
process if the existing account needs a new password.

The generator and validator deliberately avoid printing token or password
contents. `.auth/` and generated acceptance-state directories are ignored.

## Railway-backed Community Moments read-only acceptance

This workflow stores User A's Playwright state only at
`test-auth/user-a/niakofa-state.json` in the existing private
`niakofa-production-media` bucket. It uses the production API service's existing
`STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `AWS_ACCESS_KEY_ID`, and
`AWS_SECRET_ACCESS_KEY` variables; it does not add or change Railway variables
or deploy the application.

Before using the workflow, confirm in Railway that the bucket has no public-read
policy and no public CDN route. Both scripts require
`CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE=1`, refuse a configured
`STORAGE_CDN_URL`, and never set a public object ACL. The uploader and runner
also require `CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE=1` after confirming that
the API service points to the intended existing bucket. Do not delete the state
object without separate explicit approval.

Upload a local state file from the machine where it is stored. The Railway CLI
runs the command locally with the selected API service's variables injected:

```sh
railway run --service "<production API service name>" --environment production \
  env CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE=1 \
      CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE=1 \
  bash ops/upload-railway-user-a-state.sh "/absolute/path/to/niakofa-state.json"
```

The bucket-backed workflow never reads `USER_A_STATE_JSON`. Existing deployed
acceptance scripts still support that variable, so do not delete it unless those
operators have moved to local state-file paths. If a state file may have been
exposed, revoke the test session and generate a fresh state on a trusted
machine. Remove non-authentication entries that are not needed for acceptance
(such as `avatar`, `realtime-cursor`, and `mapbox.*`) to keep the state compact,
then replace the secret through the Railway or Replit secrets interface as
appropriate. Never paste state JSON into chat, logs, or source control.

Run the read-only Moments acceptance the same way. It downloads User A's state
to a mode-`0600` file in a private temporary directory, validates it, runs
Playwright with only the needed test variables, then removes the temporary
directory. It does not use `USER_A_STATE_JSON` or `USER_B_STATE_JSON`; the
optional User B isolation check is omitted for this single-account run.

```sh
railway run --service "<production API service name>" --environment production \
  env BASE_URL="https://niakofa.com" EXPECTED_COMMIT="<40-character deployed commit>" \
    ALLOW_COMMUNITY_MOMENTS_READONLY_E2E=1 CONFIRM_DISPOSABLE_ACCOUNT=1 \
    CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE=1 CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE=1 \
  bash ops/run-community-moments-bucket-certification.sh
```

`railway run` executes the command locally; it does not deploy. The wrapper
removes state-JSON variables and passes only the bucket credentials and required
test values to their child processes. Playwright tracing, screenshots, and
video are disabled for this authenticated test.

## Railway-backed private Family Story playback

The Family Story playback check reads User A state from the same private object
and uses the production API service's existing `STORAGE_*` and `AWS_*` variables.
`STORAGE_BUCKET` contains Railway's generated S3 bucket name, not necessarily the
bucket's display name; the helper validates its format but never guesses or
hardcodes that value. Confirm in Railway that the API service's storage
references point to `niakofa-production-media`. No new bucket or
`CERTIFICATION_S3_*` variables are needed.

From the machine holding the approved User A state, upload it only after
confirming the target bucket is private and that the API service references the
intended bucket:

```sh
railway run --service "<production API service name>" --environment production \
  env CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE=1 \
      CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE=1 \
  bash ops/upload-railway-user-a-state.sh "/absolute/path/to/niakofa-state.json"
```

The upload utility accepts only the fixed User A state key, validates the
local file's shape and mode `0600`, and never prints its contents. It does not
create a bucket, set public access, or delete any object. Do not remove the
production state object without separate explicit approval.

Run the read-only playback check against the exact deployed commit:

```sh
railway run --service "<production API service name>" --environment production \
  env BASE_URL="https://niakofa.com" EXPECTED_COMMIT="<40-character deployed commit>" \
    ALLOW_FAMILY_STORY_READONLY_E2E=1 CONFIRM_DISPOSABLE_ACCOUNT=1 \
    CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE=1 \
    CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE=1 \
  pnpm test:family-story-playback:run
```

Optionally set `FAMILY_ID` and `FAMILY_STORY_ID` to target a specific existing
private Story. If omitted, the check finds an accessible private Story linked
to a video. It blocks non-GET API requests, verifies the authenticated account
is approved and unsuspended, checks the exact served commit, confirms the
private media GET stays on `https://niakofa.com` with a video response, and
plays the video. It does not upload, edit, or delete production media or
records. Browser traces, screenshots, and video are disabled, and the
temporary state file is removed on exit.

## Gated production media certification

Unlike the Family Story playback check above, this browser suite can upload and
clean up media. Run it only with approved disposable accounts and the exact
served commit. It requires both User A and User B states, the explicit
`ALLOW_MEDIA_PRODUCTION_E2E`, `CONFIRM_DISPOSABLE_ACCOUNT`,
`CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE`, and
`MEDIA_PLATFORM_V21_BROWSER_SMOKE` gates, plus a positive
`MEDIA_SMOKE_CONTEXT_ID` and `MEDIA_SMOKE_CONTEXT_KIND`.

Provide User A as a private `USER_A_STATE` file or `USER_A_STATE_JSON` secret.
If neither is provided, the runner downloads one of two fixed objects from the
existing bucket: `certification/user-a-state.json` (default, read-only) or
`test-auth/user-a/niakofa-state.json` (also read-only in this runner). Bucket
reads require the same privacy and existing-bucket confirmations as the other
Railway workflows. The helper refuses access when `STORAGE_CDN_URL` is set,
rejects other object keys, and rejects certification settings that identify a
different bucket or endpoint from the API settings. It never creates a bucket,
changes object access, or passes bucket credentials to Playwright.

Run it only after the operator has verified the private bucket and approved
disposable states:

```sh
railway run --service "<production API service name>" --environment production \
  env BASE_URL="https://niakofa.com" EXPECTED_COMMIT="<40-character deployed commit>" \
    MEDIA_SMOKE_CONTEXT_KIND="community" MEDIA_SMOKE_CONTEXT_ID="<approved context id>" \
    ALLOW_MEDIA_PRODUCTION_E2E=1 CONFIRM_DISPOSABLE_ACCOUNT=1 \
    CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE=1 MEDIA_PLATFORM_V21_BROWSER_SMOKE=1 \
    CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE=1 \
    CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE=1 \
    USER_B_STATE="/absolute/path/to/approved-user-b-state.json" \
  bash ops/run-media-production-certification.sh
```

This command executes locally with the selected Railway service's variables; it
does not deploy. The runner validates both states before Playwright, keeps any
JSON-materialized state in a private temporary directory, removes it on exit,
and gives the browser process only the required test settings and state-file
paths. `MEDIA_CERT_PHOTO_ONLY_SMOKE=1` selects the separately gated photo-only
diagnostic. Do not use this suite as evidence that V21 is ready unless its
production prerequisites have been separately verified.
