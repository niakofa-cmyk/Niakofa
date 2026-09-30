# Niakofa V21 Production Acceptance Matrix

This is the release gate for the universal media foundation. A healthy
deployment or a configured bucket is not enough to enable `MEDIA_PLATFORM_V21`.
Record evidence for every checked row from the production runtime.

**Current 2026-09-30 hold:** The new admin-only one-shot probe reached its
storage stage after the synthetic FFmpeg/FFprobe check, but failed with
`cleanup: not_started`. It did not report a PUT or an object requiring cleanup.
The probe window was closed, production Redis readiness was independently
`ready`, and V21 remained off. The old probe required a literal display-name
bucket even though this provider's unique S3 API name can differ; that
pre-write assumption is being removed. Gate 2 must be repeated against the
served revision and intended bucket before any V21 activation. The 2026-09-28
results below remain historical evidence, not current release approval.

**Observed 2026-09-28:** The owner ran the probes from a one-off shell in the
production API image on the served revision. The first storage probe failed
with `NoSuchBucket` and three unsuccessful cleanup attempts: the service used
the bucket's display name, not its unique S3 API name. After switching
`STORAGE_BUCKET` and `STORAGE_REGION` to references to the same production
bucket as the endpoint and credentials, the second probe reported
`ok=true`, `probe=put-head-delete`, `deleted=true`, and one cleanup attempt.
The corrected script requires an explicit provider not-found response after
deletion. The toolchain probe reported `ok=true`, a generated MP4 read by
FFprobe, and 16×16 dimensions. These are owner-supplied shell results, not a
completed approved-account or device acceptance pass. The initial failed
probe could not confirm cleanup in the nonexistent bucket; inspect the probe
namespace if provider-side ambiguity remains.

Production `/api/healthz` reported `media_platform_flag=true` before these
tests, and `/api/readiness` was healthy. This work did not activate the flag.
Turning an already-live flag off requires an operational decision because it
may interrupt existing media use. Do not treat its value or these two probes
as approval of the full rollout.

**Observed 2026-09-28 (authenticated media acceptance):** Production served
`f8f761aafed2584b26d6daec8fb0467d0bb05183`; all five GitHub checks passed,
including Release Validation and deployment verification. Two distinct approved
disposable accounts authenticated through private, validated states. For the
owner-approved direct conversation `1`, account A received 200 and account B
received 404 before uploads. The first test attempt stopped at a 401 on its
same-origin PUT because the test harness omitted the Bearer header; the resulting
pending test asset `1` was owner-deleted (204) and confirmed absent from the
shared list. After correcting the harness, the gated browser test passed:
photo `2` and video `3` reached `ready`, the photo original and thumbnail and
the video playback variant returned 200 to A, and all three returned 404 to B.
Disposable asset `4` was deleted by A (204); its original and thumbnail returned
404, and it disappeared from the shared list. Photo `2` and video `3` remain
for review in that conversation. Temporary browser states and traces were
removed. This pass does not certify physical devices, independently identify
the stored bucket objects, or inspect the worker's temporary-file namespace.

**Published implementation, not production acceptance:** The subsequent unified
Sparks Studio changes replace new Community/Hub inline Base64 uploads with
bounded, authenticated binary uploads while retaining legacy Story reads and
older client compatibility. They also add retryable cleanup for abandoned
uploads and account-owned media. These source changes have since been published
but have not been exercised against the deployed revision. The earlier
production pass above remains evidence only for the commit it names; it does not certify the new
Studio, cleanup, or draft-to-publish behavior.

**Automated media contracts on current `main`:** CI now covers the raw-body
64 MiB boundary, malformed and MIME-spoofed content, WebP VP8/VP8L metadata,
short-lived playback-grant expiry/tamper rejection, authenticated route
registration, deletion/worker race contracts, and durable cleanup behavior.
These are regression protections for the source tree; they do not replace
production storage-object inspection, approved-account isolation, worker
runtime evidence, or physical-device checks.

## Gate 1 — Application and storage configuration

- [x] CI, typecheck, and tests are green on the intended commit
- [x] Deploy verification is green (owner-reported check for the probe revision)
- [x] `/api/healthz` reports the intended S3-compatible backend
- [x] `cloud_configured=true`, `credentials_present=true`, and `missing=[]`
- [x] `/api/readiness` is healthy, including Redis/BullMQ
- [x] `MEDIA_PLATFORM_V21` remains unset or false until Gates 2 and 3 pass (2026-09-30)
- [ ] `STORAGE_CDN_URL` remains unset for the private bucket/presigned model

## Gate 2 — Real production object-storage I/O

- [ ] PUT succeeds from the current production API runtime/environment (historical pass only)
- [ ] HEAD succeeds for the generated probe key
- [ ] HEAD `Content-Length` matches the uploaded byte count
- [ ] GET returns exact bytes and SHA-256
- [ ] DELETE succeeds
- [ ] A post-delete HEAD returns an explicit provider not-found response
- [ ] A failed PUT or HEAD triggers bounded cleanup or durable manual reconciliation
- [ ] The current probe reports cleanup success and confirms its own object is gone
- [x] The operator route requires admin auth, a short explicit switch, and a one-shot durable claim

Run the probe with:

```bash
node artifacts/api-server/scripts/verify-object-storage.mjs
```

## Gate 3 — Production media toolchain

- [x] FFmpeg creates a synthetic media fixture in the production runtime
- [x] FFprobe reads the fixture’s video metadata
- [ ] Both binaries are available to the actual media worker process
- [x] The temporary fixture is removed after success or failure (script `finally` path)

Run the probe with:

```bash
node artifacts/api-server/scripts/verify-media-toolchain.mjs
```

## Gate 4 — V21 activation and media acceptance

Only after Gates 2 and 3:

- [ ] Set `MEDIA_PLATFORM_V21=1` on the production API service
- [ ] Redeploy and confirm the media worker starts without a toolchain/storage error
- [x] Authenticated photo upload initializes, uploads, completes, and queues
- [x] Authenticated video upload initializes, uploads, completes, and queues
- [x] The media asset reaches `ready`
- [ ] Thumbnail/variant objects are written to the intended bucket
- [x] Shared media retrieval is authorized for the owning context
- [x] An unauthorized user cannot retrieve the object or variant
- [x] Owner deletes a disposable asset; original and thumbnail return 404 and the shared list no longer includes it
- [ ] Failure paths leave no temporary processing files or orphaned probe objects

The live browser certification is deliberately double-gated. It must be run
through `pnpm test:media-production` with all of these explicit operator
inputs:

```bash
ALLOW_MEDIA_PRODUCTION_E2E=1 \
CONFIRM_DISPOSABLE_ACCOUNT=1 \
CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE=1 \
MEDIA_PLATFORM_V21_BROWSER_SMOKE=1 \
BASE_URL=https://... \
EXPECTED_COMMIT=<deployed-commit> \
USER_A_STATE=/private/path/user-a-state.json \
USER_B_STATE=/private/path/user-b-state.json \
MEDIA_SMOKE_CONTEXT_KIND=direct \
MEDIA_SMOKE_CONTEXT_ID=<approved-context-id> \
pnpm test:media-production
```

The runner refuses to start without two approved disposable storage states
(owner and unauthorized user), a positive context ID, the full 40-character
deployed commit, and explicit V21 activation confirmation. It does not set
`MEDIA_PLATFORM_V21` itself. Cross-account original and thumbnail retrieval
must return 404.

If existing storage states are missing or malformed, **do not** retry the
production runner. After rotating any credentials exposed in chat, enter the
new disposable-account passwords through the secure secrets form (never in
chat). The accounts must be distinct and approved. Build states from those
credentials only in a private directory outside the checkout:

```bash
state_dir="$(mktemp -d /tmp/niakofa-media-states.XXXXXX)"
chmod 700 "$state_dir"
ALLOW_MEDIA_CERT_STATE_CREATION=1 \
MEDIA_CERT_STATE_DIR="$state_dir" \
BASE_URL=https://<canonical-production-origin> \
EXPECTED_COMMIT=<full-served-commit> \
MEDIA_CERT_A_EMAIL=<approved-disposable-account-a> \
MEDIA_CERT_B_EMAIL=<approved-disposable-account-b> \
node ops/build-media-certification-states.mjs
node ops/validate-user-a-state.mjs "$state_dir/media-cert-a.json" USER_A_STATE
node ops/validate-user-a-state.mjs "$state_dir/media-cert-b.json" USER_B_STATE
```

The builder refuses non-HTTPS origins, wrong commits, unapproved/duplicate
accounts, non-private directories, or invalid state shapes. It never prints
passwords or session tokens. Pass the two validated paths as `USER_A_STATE`
and `USER_B_STATE` to the gated runner. Remove the temporary directory when
the approved session ends; never commit, upload, or paste these files. The
LiveKit connection secrets are separate from browser storage states and
cannot replace them.

**Deletion and devices:** The upload smoke intentionally leaves its two
test assets in the approved disposable conversation for review. A successful
PUT–HEAD–DELETE probe certifies the temporary storage probe only, not
user-facing media deletion. Test deletion through the authorized app/API
path using disposable media and verify the object is gone; retain any
evidence the owner requests until the session is declared complete.
Desktop Playwright or mobile viewport emulation cannot certify real iOS or
Android camera, gallery, playback, or accessibility behavior.

## Gate 5 — Unified Sparks Studio release

- [ ] Deploy and confirm the exact served commit contains the bounded same-origin upload parser and Studio changes
- [ ] With approved disposable accounts, publish a Community and a Hub Moment through Studio; verify media, overlays, privacy, 24-hour expiry, and draft recovery after reload or interruption
- [ ] Confirm a listing-owned Exchange draft can resume across a rollout/flag change, publish once after a lost response, and enter/leave the authorized moderation queue
- [ ] Confirm paused, removed, and rejected listings lose discovery and playback access without deleting unrelated legacy Stories
- [ ] Run the separately gated `pnpm test:community-exchange-sparks-production` only with an approved disposable listing and exact served commit; reconcile every created draft/asset afterward
- [ ] Inspect the actual worker runtime for FFmpeg/FFprobe and verify its thumbnail/variant keys are in the intended private bucket
- [ ] Confirm account/listing deletion and failed processing leave no inaccessible-but-retained objects, stalled cleanup markers, or worker temporary files
- [ ] Complete physical iOS and Android capture, interruption/retry, private playback, and accessibility checks
- [ ] Verify creator-uploaded music on Community and Hub video Moments: HTTPS license/source references, server-owned asset IDs, owner/context checks, and no client-supplied storage keys or `licensed` booleans
- [ ] Confirm mixing writes a separate variant and preserves the already-ready video on processing failure; confirm Moment deletion cleans the attached soundtrack and mixed variant together
- [ ] Confirm Exchange listing Sparks reject music and that the creator-attestation flow is not presented as third-party license verification or a music catalog

The Exchange runner cannot prove bucket placement, account erasure, or native
device behavior. It requires an approved disposable listing, two validated
disposable account states, the exact served commit, a unique
`SPARK_SMOKE_RUN_ID`, and a private `SPARK_SMOKE_RECOVERY_DIR` outside the
checkout. Keep that recovery directory across interrupted runs. The runner
retains unresolved IDs and fails closed until an operator independently
reconciles database rows and storage objects; an empty feed or accepted
deletion request is not proof of physical removal. Do not interpret a passing
API/browser run as completion of the independent operational gates. Do not
toggle the already-live media flag or alter production storage settings
without an owner-approved rollout plan.

## Security rule

Do not add a permanent HTTP endpoint whose sole purpose is credential-backed
PUT/DELETE certification. Run certification inside the trusted production
environment using the same variables and image as the worker.