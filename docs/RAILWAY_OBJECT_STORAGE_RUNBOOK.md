# Niakofa Railway Object Storage Runbook

## Current production resource

Railway project: `precious-abundance`  
Environment: `production`  
API service: `zesty-ambition`  
Bucket display name: `niakofa-production-media`  
Bucket region: `sjc`

The bucket was provisioned through Railway. Railway assigns the globally unique
S3 bucket name and credentials inside the bucket resource; never replace those
values with a guessed name or endpoint.

## Native variable wiring

The API service uses these app-facing names, backed by Railway variable
references to the bucket resource:

| Niakofa variable | Railway bucket reference |
|---|---|
| `STORAGE_BUCKET` | `BUCKET` |
| `STORAGE_ENDPOINT` | `ENDPOINT` |
| `STORAGE_REGION` | `REGION` |
| `AWS_ACCESS_KEY_ID` | `ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` | `SECRET_ACCESS_KEY` |

The references are already set on the production API service with deployment
skipped. The next API deployment will receive the resolved values. Secret
values are intentionally not stored in this repository or this document.

## Verification order

1. Deploy the API while `MEDIA_PLATFORM_V21` remains unset.
2. Run the probe from the API workspace:

   ```bash
   pnpm verify:storage
   ```

   The probe must pass `put → head → delete`.
3. Check `/api/healthz` and `/api/readiness` for `storage_readiness`.
4. Confirm media routes remain disabled while the flag is off.
5. Only after the previous checks pass, set `MEDIA_PLATFORM_V21=1` in Railway
   and redeploy.
6. Run the authenticated media acceptance path: upload → complete → queue →
   worker → thumbnail/variant → playback.

## Safe rollback

Unset `MEDIA_PLATFORM_V21` and redeploy. Do not delete the bucket as a rollback
step; existing media objects and database rows need a separate retention plan.

## Commands

```bash
# Verify an existing Railway bucket; this does not enable media.
pnpm verify:storage

# Only for providers that support S3 CreateBucket.
pnpm provision:storage

# Railway Bucket creation is performed by Railway, not by this script.
STORAGE_PROVISION_VERIFY_ONLY=1 pnpm provision:storage
```