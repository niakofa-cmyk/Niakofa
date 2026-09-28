# Niakofa V21 Production Acceptance Matrix

This is the release gate for the universal media foundation. A healthy
deployment or a configured bucket is not enough to enable `MEDIA_PLATFORM_V21`.
Record evidence for every checked row from the production runtime.

**Observed 2026-09-28 (not a passed gate):** Production `/api/healthz`
reported `media_platform_flag=true`, a configured S3-compatible
`niakofa-production-media` bucket, and credential presence both before and
after the Sparks deployment. `/api/readiness` reported healthy on the deployed
commit. The flag was already on; this review did not activate it. There is no
recorded production PUT/HEAD/DELETE probe, worker FFmpeg/FFprobe execution,
approved-account media round trip, cleanup verification, or real-device
evidence. Leave the unchecked gates unchecked. Turning an already-live flag
off requires an operational decision because it may interrupt existing media
use; do not interpret its current value as approval to expand the rollout.

## Gate 1 — Application and storage configuration

- [ ] CI, typecheck, and tests are green on the intended commit
- [ ] Deploy verification is green
- [ ] `/api/healthz` reports the intended S3-compatible backend
- [ ] `cloud_configured=true`, `credentials_present=true`, and `missing=[]`
- [ ] `/api/readiness` is healthy, including Redis/BullMQ
- [ ] `MEDIA_PLATFORM_V21` remains unset or false until Gates 2 and 3 pass
- [ ] `STORAGE_CDN_URL` remains unset for the private bucket/presigned model

## Gate 2 — Real production object-storage I/O

- [ ] PUT succeeds from the production API runtime/environment
- [ ] HEAD succeeds for the generated probe key
- [ ] HEAD `Content-Length` matches the uploaded byte count
- [ ] DELETE succeeds
- [ ] A post-delete HEAD returns a provider-specific not-found result; transient or ambiguous errors fail the probe
- [ ] A failed PUT or HEAD still triggers bounded cleanup attempts
- [ ] The probe reports cleanup success and leaves no probe object behind
- [ ] No permanent public/admin storage-probe route was added

Run the probe with:

```bash
node artifacts/api-server/scripts/verify-object-storage.mjs
```

## Gate 3 — Production media toolchain

- [ ] FFmpeg creates a synthetic media fixture in the production runtime
- [ ] FFprobe reads the fixture’s video metadata
- [ ] Both binaries are available to the actual media worker process
- [ ] The temporary fixture is removed after success or failure

Run the probe with:

```bash
node artifacts/api-server/scripts/verify-media-toolchain.mjs
```

## Gate 4 — V21 activation and media acceptance

Only after Gates 2 and 3:

- [ ] Set `MEDIA_PLATFORM_V21=1` on the production API service
- [ ] Redeploy and confirm the media worker starts without a toolchain/storage error
- [ ] Authenticated photo upload initializes, uploads, completes, and queues
- [ ] Authenticated video upload initializes, uploads, completes, and queues
- [ ] The media asset reaches `ready`
- [ ] Thumbnail/variant objects are written to the intended bucket
- [ ] Shared media retrieval is authorized for the owning context
- [ ] An unauthorized user cannot retrieve the object or variant
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

## Security rule

Do not add a permanent HTTP endpoint whose sole purpose is credential-backed
PUT/DELETE certification. Run certification inside the trusted production
environment using the same variables and image as the worker.