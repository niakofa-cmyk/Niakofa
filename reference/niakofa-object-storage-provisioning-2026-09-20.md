# Niakofa Object Storage Provisioning Reference

Date: 2026-09-20

## Source materials

This reference was produced from:

- the supplied Niakofa V21 object-storage provision ZIP;
- the supplied enhanced object-storage provision ZIP;
- the three supplied review/assessment documents;
- the verified Niakofa `origin/main` state at `e36c605`;
- Railway's official Storage Buckets documentation.

The original uploads remain available under `attached_assets/` in the workspace.
No credentials or token values are copied into this repository.

## Verified Railway resource

- Project: `precious-abundance`
- Environment: `production`
- API service: `zesty-ambition`
- Bucket display name: `niakofa-production-media`
- Region: `sjc`
- Bucket ID: `fbf487c9-3eb3-422d-9dd8-cca3b0e7da87`

Railway generates the globally unique S3 bucket name and provides private
credentials through the bucket resource. The API service receives those values
through native Railway references, mapped to Niakofa's existing environment
contract:

```text
STORAGE_BUCKET       <- bucket.BUCKET
STORAGE_ENDPOINT     <- bucket.ENDPOINT
STORAGE_REGION       <- bucket.REGION
AWS_ACCESS_KEY_ID    <- bucket.ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY<- bucket.SECRET_ACCESS_KEY
```

## Repository implementation

- `artifacts/api-server/src/lib/storage.ts` remains the single family/media
  storage abstraction.
- `storageReadiness.ts` reports backend, completeness, missing non-secret
  configuration, and whether production media is safe.
- `/api/healthz` and `/api/readiness` expose readiness without secrets.
- `scripts/verify-object-storage.mjs` performs a unique put/head/delete probe.
- `scripts/provision-object-storage.mjs` supports providers that expose
  `CreateBucket`, while Railway bucket creation stays in Railway.
- `MEDIA_PLATFORM_V21` remains opt-in and fail-closed.

## Production gate

The safe sequence is:

```text
real Railway bucket
  -> native variable references
  -> deploy with MEDIA_PLATFORM_V21 off
  -> put/head/delete probe
  -> health/readiness confirmation
  -> enable MEDIA_PLATFORM_V21
  -> authenticated media acceptance
```

The bucket has been created and the references have been set, but media
activation is intentionally not complete until the next deployed API receives
and verifies the resolved credentials and passes the acceptance path.