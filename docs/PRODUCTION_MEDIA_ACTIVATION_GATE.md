# Niakofa Production Media Activation Gate

Do not reorder these gates.

- [x] Production Redis exists.
- [x] One Railway production bucket exists.
- [x] API service has native references for bucket, endpoint, region, and credentials.
- [ ] API deployment receives the resolved references.
- [ ] Put/head/delete storage probe passes.
- [ ] API deploys with `MEDIA_PLATFORM_V21` off.
- [ ] `/api/healthz` reports cloud storage readiness.
- [ ] Media routes remain fail-closed while the flag is off.
- [ ] `MEDIA_PLATFORM_V21=1` is set deliberately.
- [ ] Production boot passes storage and FFmpeg/FFprobe gates.
- [ ] Upload → complete → queue → worker → thumbnail/variant → playback passes.

## Hard stops

Stop and fix the environment if:

- `STORAGE_BUCKET` is missing or contains a placeholder.
- a required bucket credential is missing.
- the put/head/delete probe fails.
- the API reports local disk after the references are deployed.
- FFmpeg or FFprobe is unavailable with V21 enabled.
- the media worker cannot connect to Redis.

`MEDIA_PLATFORM_V21` stays off until every preceding gate is verified.