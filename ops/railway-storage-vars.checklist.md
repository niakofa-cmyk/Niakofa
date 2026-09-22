# Railway production API storage checklist

Fill these only from the real Railway Bucket resource.

## API service references

- [x] `STORAGE_BUCKET` → bucket `BUCKET`
- [x] `STORAGE_ENDPOINT` → bucket `ENDPOINT`
- [x] `STORAGE_REGION` → bucket `REGION`
- [ ] `STORAGE_CDN_URL` (optional; leave unset for private media)
- [x] `AWS_ACCESS_KEY_ID` → bucket `ACCESS_KEY_ID`
- [x] `AWS_SECRET_ACCESS_KEY` → bucket `SECRET_ACCESS_KEY`

## Activation

- [x] Railway bucket created in production.
- [ ] API deployment with `MEDIA_PLATFORM_V21` unset.
- [ ] `pnpm verify:storage` succeeds.
- [ ] `/api/healthz` and `/api/readiness` report cloud storage.
- [ ] Media endpoint still returns `MEDIA_PLATFORM_DISABLED`.
- [ ] Set `MEDIA_PLATFORM_V21=1`.
- [ ] Redeploy and run authenticated media acceptance.