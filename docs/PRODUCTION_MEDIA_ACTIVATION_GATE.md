# Niakofa Production Media Activation Gate

Keep the order below for any future activation. Current production status is
recorded separately so an unverified prerequisite is not mistaken for a pass.

## Ordered pre-activation gates

1. Production Redis exists.
2. One private production bucket exists.
3. The API service has native references for bucket, endpoint, region, and
   credentials.
4. The API deployment receives those references while
   `MEDIA_PLATFORM_V21` is off.
5. The one-off storage probe completes PUT → HEAD → GET → DELETE → HEAD-missing
   verification, including cleanup after a failed operation.
6. `/api/healthz` reports cloud-storage readiness and `/api/readiness` confirms
   the required storage, Redis, schema, and worker dependencies.
7. Media routes remain fail-closed while the flag is off.
8. The production boot passes the storage and FFmpeg/FFprobe gates.
9. A deliberate operator decision enables `MEDIA_PLATFORM_V21=1`.
10. An approved production photo/video flow passes upload → completion → queue
    → worker → thumbnail/variant → playback.

The one-off storage probe creates a uniquely named text object in its probe
prefix and deletes only that probe object. It does not target existing photos,
videos, or media creations. Do not run it without explicit operator approval.

## Current production record — October 5, 2026

- `MEDIA_PLATFORM_V21` is enabled in production at the user's direction.
- The served application commit is
  `517e2d3c71c3bcb1580bf0886eeaee5d43a5d0f0`. This is the deployed application
  version, not a later documentation or test-only commit.
- Production health and readiness returned HTTP 200; readiness was `true`, and
  cloud storage, schema, Redis, and the media worker were ready.
- Production photo and video certification flows previously passed with V21
  enabled. The existing test photo, Story, and source clips were retained; no
  test media was deleted during the later flag enablement.
- The standalone PUT/HEAD/GET/DELETE storage probe has **not** been run and is
  not claimed as passed. A separate production verification of the media
  routes with V21 off is also not recorded here.

This record does not authorize another production state read, storage write, or
flag change. The current enabled state is not evidence that an unrecorded gate
passed.

## Hard stops

Stop and fix the environment if:

- `STORAGE_BUCKET` is missing or contains a placeholder.
- a required bucket credential is missing.
- the put/head/delete probe fails.
- the API reports local disk after the references are deployed.
- FFmpeg or FFprobe is unavailable with V21 enabled.
- the media worker cannot connect to Redis.

Before any future activation, keep `MEDIA_PLATFORM_V21` off until every
preceding gate is verified. Do not delete existing test photos, videos, or
other media while performing certification.
