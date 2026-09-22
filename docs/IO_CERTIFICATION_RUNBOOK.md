# Niakofa production object-storage and media certification runbook

## Before you start

Use the intended private bucket, `niakofa-production-media`. Do not delete the
older `niakofa-media` bucket until a retention decision is explicit. Do not
paste or commit credentials, and do not set `MEDIA_PLATFORM_V21=1` during
storage or toolchain certification.

## Gate A — real storage I/O

Preferred: open a one-off shell for the production API service in Railway. The
service already has the `STORAGE_*` and AWS variables through Railway
references. From the repository root run:

```bash
node artifacts/api-server/scripts/verify-object-storage.mjs
```

Success must include `"ok": true`, `"probe": "put-head-delete"`, and
`"deleted": true`. The generated key is random and restricted to the
`media-assets/_probe/` namespace. On PUT or HEAD failure, the script still
attempts bounded cleanup.

If the Railway shell is unavailable, invoke
`runStorageIoProbe()` from a trusted one-off/internal process using the
already-injected production environment. Do not expose a permanent HTTP route.

## Gate B — actual media toolchain execution

Run on the same production image as the API media worker:

```bash
node artifacts/api-server/scripts/verify-media-toolchain.mjs
```

This is stronger than a version check: FFmpeg generates a tiny MP4, FFprobe
reads its dimensions, and the temporary directory is removed in a `finally`
block. If it fails, install/enable FFmpeg in the production image before
continuing.

## Gate C — controlled activation

Only after Gates A and B pass:

1. Set `MEDIA_PLATFORM_V21=1` on the production API service.
2. Redeploy.
3. Confirm boot logs show the toolchain verification and media worker startup.
4. Run the authenticated photo/video upload acceptance described in
   `docs/PRODUCTION_ACCEPTANCE_MATRIX.md`.
5. Confirm the asset reaches `ready`, variants are stored in the intended
   bucket, and authorized retrieval works.

## Failure handling

| Symptom | Action |
| --- | --- |
| `STORAGE_NOT_CONFIGURED` | Fix Railway variable references; do not invent values |
| `AccessDenied` or I/O failure | Check bucket policy, credentials, endpoint, and region |
| `cleanup failed` | Stop activation, inspect the bucket probe namespace, and rerun only after cleanup is confirmed |
| `/api/healthz` reports local disk | Redeploy after variables are attached and verify the served commit |
| FFmpeg/FFprobe smoke fails | Fix the production image before enabling V21 |
| Boot fails after flag-on | Turn the flag back off, preserve logs, and fix the reported gate |