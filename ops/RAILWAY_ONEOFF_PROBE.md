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

Success means a tiny object completed real `PUT → HEAD` (exact byte size) →
bounded `GET` (exact bytes and SHA-256) → `DELETE` → `HEAD` with an explicit
object-not-found 404. Provider calls have one SDK attempt and a six-second
client-side bound; cleanup gets at most three delete/verification attempts.
The script never logs credentials, bucket names, or endpoint URLs, and never
changes `MEDIA_PLATFORM_V21`.

Success includes:

```json
{
  "ok": true,
  "probe": "put-head-get-delete",
  "deleted": true,
  "media_platform_flag_unchanged": true
}
```

If cleanup cannot be proven, the command fails with `CLEANUP INCOMPLETE` and
prints the opaque random object key needed for manual cleanup. Do not interpret
any failed or interrupted probe as certification success. As with any remote
object store, client timeouts cannot guarantee provider-side cancellation; the
script bounds its wait and retries cleanup, but a persistent outage or
inconsistent provider may require manual inspection/deletion.

In particular, if the PUT response is lost or times out, the provider may
commit the object after the script's final cleanup check. The command therefore
always reports `CLEANUP INCOMPLETE` with that key, even if a cleanup HEAD saw
404. An operator must reconcile that exact key (check for it, delete if
present, and verify absence) before starting another probe; do not rerun with a
new key while the previous ambiguous PUT remains unchecked.

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