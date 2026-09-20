# Niakofa V21 Production Acceptance Matrix

This is the release gate for the universal media foundation. A healthy
deployment or a configured bucket is not enough to enable `MEDIA_PLATFORM_V21`.
Record evidence for every checked row from the production runtime.

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

## Security rule

Do not add a permanent HTTP endpoint whose sole purpose is credential-backed
PUT/DELETE certification. Run certification inside the trusted production
environment using the same variables and image as the worker.