# Railway one-off production certification

Credentials stay inside Railway and are never pasted into chat or committed.

## Storage I/O

1. Open the production API service.
2. Confirm its variables reference `niakofa-production-media`, not the older
   `niakofa-media`, unless that choice is intentional.
3. Open the service shell or run a one-off command from the repository root.
4. Execute:

```bash
node artifacts/api-server/scripts/verify-object-storage.mjs
```

Success includes:

```json
{
  "ok": true,
  "probe": "put-head-delete",
  "deleted": true,
  "media_platform_should_still_be_off": true
}
```

## Media toolchain

```bash
node artifacts/api-server/scripts/verify-media-toolchain.mjs
```

The command runs a real FFmpeg-to-FFprobe synthetic media smoke and removes
its temporary directory.

## After both gates pass

1. Set `MEDIA_PLATFORM_V21=1` on the production API service only.
2. Redeploy.
3. Confirm the media worker starts with no storage/toolchain error.
4. Run authenticated media upload acceptance.

Do not delete `niakofa-media`, set a fake `STORAGE_CDN_URL`, or enable media
before both one-off probes pass.