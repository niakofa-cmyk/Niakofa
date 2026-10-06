# Railway one-off production certification

Credentials stay inside Railway and are never pasted into chat or committed.

## Storage I/O

### No-shell fallback — one-shot Railway Function

Use this when the production API service shell is unavailable and the gated
admin route is not appropriate. The checked-in builder bundles the existing
bounded certification helper into a single Railway Function file:

```bash
node artifacts/api-server/scripts/build-railway-storage-probe-function.mjs
```

The output is source for a non-HTTP Function that runs once at startup and
exits. Do not commit the generated output. In the production environment, stage
only this temporary Function and these seven variables:

| Function variable | Value |
| --- | --- |
| `STORAGE_BUCKET` | `${{niakofa-production-media.BUCKET}}` |
| `STORAGE_ENDPOINT` | `${{niakofa-production-media.ENDPOINT}}` |
| `STORAGE_REGION` | `${{niakofa-production-media.REGION}}` |
| `AWS_ACCESS_KEY_ID` | `${{niakofa-production-media.ACCESS_KEY_ID}}` |
| `AWS_SECRET_ACCESS_KEY` | `${{niakofa-production-media.SECRET_ACCESS_KEY}}` |
| `EXPECTED_STORAGE_BUCKET` | The independently verified unique S3 API bucket name, not the Railway display name |
| `PROBE_KEY` | One fixed `media-assets/_probe/YYYY-MM-DD/<uuid>.txt` key |

The five storage values must reference the same bucket resource. The runner
checks `STORAGE_BUCKET === EXPECTED_STORAGE_BUCKET` and validates the key before
creating a client, so a mismatch or malformed key performs no storage write.
Never print or copy resolved credentials. Do not add a domain, HTTP handler,
cron schedule, shared variable, API-service variable, or media flag change.

Before deploying, inspect the staged patch: it must contain only the new
Function and its seven variables, with no shared-variable or existing
API-service changes. Commit that patch once. The Function makes one bounded
PUT → exact-size HEAD → bounded GET/content-hash → DELETE → explicit
HEAD-not-found verification, using one SDK attempt and at most three cleanup
attempts. Its successful `TEMP_STORAGE_PROBE_RESULT` log line contains status
only, not credentials, bucket name, or endpoint. If cleanup is unproven, the
failure line also includes the exact opaque `manualCleanupKey` needed for
reconciliation.

After success, remove the temporary Function and verify it is absent from the
production environment and that no staged changes remain. If cleanup is
unproven, keep the exact reported `manualCleanupKey`, reconcile that key with
the provider, and verify absence before retrying; never retry with a new key.
Do not remove the Function until the cleanup issue is resolved. This check does
not certify uploads, media processing, privacy rules, or device behavior, and
it does not change `MEDIA_PLATFORM_V21`.

### No-shell option (admin-only, disabled by default)

The API can run the same bounded storage I/O and FFmpeg-to-FFprobe checks
without a Railway shell. On the **production API service only**, set
`MEDIA_CERT_PROBE_ENABLED=1` while keeping `MEDIA_PLATFORM_V21=0`, then
redeploy. Within 30 minutes of that process starting, an authenticated admin
can open **Admin → Configure → System** and click **Run one-time probe**.
The page sends one `POST /api/admin/media-cert/probe` with the existing admin
session and polls `GET /api/admin/media-cert/probe` until
the result is `passed` or `failed`; both endpoints respond without cache.
No credential copying is needed. Do not paste tokens or full responses into
chat; share non-secret status.

The probe uses the production API service's configured `STORAGE_BUCKET` without
printing its value. Before triggering it, an operator must verify in Railway
that this is the **unique S3 API name of the intended production bucket**, and
that the endpoint and credentials belong to the same bucket. The display name
can differ from the S3 API name; hardcoding a display name would incorrectly
reject a valid configuration. The probe certifies I/O, not bucket identity.
It records a permanent, atomic attempt in PostgreSQL per served
commit across API replicas and stores the opaque key before the PUT. If the
process crashes mid-probe, a later GET reports `interrupted`
and the key for manual reconciliation. `failed` with `cleanup: unproven`
likewise requires checking and deleting that key in the bucket and verifying
absence after the provider settles. **Never retry with a new key while cleanup
is unproven.** Toolchain or bucket checks can fail without writing an object.
Immediately reset `MEDIA_CERT_PROBE_ENABLED=0` after recording the result.
Neither endpoint changes V21. A successful probe is not evidence that a real
Story upload, composition, privacy rule, or phone camera has passed.

### Railway service-shell option

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