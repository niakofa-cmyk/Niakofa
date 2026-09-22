---
name: Niakofa family asset storage
description: Dual-backend storage abstraction for Family Vault assets — local disk vs S3/R2.
---

# Family Asset Storage

## The rule
All family asset I/O goes through `artifacts/api-server/src/lib/storage.ts`. Never import `fs` or `path` directly in route files for family assets.

**Why:** Railway containers have ephemeral filesystems — uploads written to local disk are lost on restart/redeploy. The storage module transparently routes to S3/R2 when `STORAGE_BUCKET` is set, and falls back to `uploads/` on disk for Replit dev.

## How to apply
- `putAsset(key, buffer, mimeType)` — write a file
- `streamOrRedirectAsset(key, res)` — serve via sendFile (local) or 307 presigned redirect (cloud)
- `getAssetUrl(key)` — returns local API path or presigned/CDN URL
- `deleteAsset(key)` — best-effort removal
- `getStorageDescription()` — human string for healthz (`"local-disk"` | `"cloudflare-r2:bucket"` | `"aws-s3:bucket"`)
- `isCloudStorageConfigured()` — boolean check for conditional logic

## Env vars (all optional — absence = local-disk)
| Var | Purpose |
|-----|---------|
| `STORAGE_BUCKET` | Bucket name; **presence enables cloud mode** |
| `STORAGE_ENDPOINT` | R2/MinIO endpoint URL (e.g. `https://<acct>.r2.cloudflarestorage.com`) |
| `STORAGE_REGION` | Defaults to `"auto"` (R2) or `"us-east-1"` (AWS) |
| `STORAGE_CDN_URL` | Optional public CDN prefix — skips presigning, gives stable URLs |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Standard SDK vars; R2 uses these too |

## Packages
`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` are installed in `artifacts/api-server`. The SDK client is lazy-imported (only loads when `STORAGE_BUCKET` is present) so local-disk startup has zero AWS SDK overhead.

## Serve middleware invariant
`GET /api/family/assets/*` must be registered **before** the `/:id` param route in the router, or "assets" is treated as a family ID. This is already correct in `family.ts`.
