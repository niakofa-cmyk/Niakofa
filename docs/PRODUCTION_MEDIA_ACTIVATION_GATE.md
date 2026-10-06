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

## Historical production record — October 5, 2026

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

## Read-only deployment refresh — October 6, 2026

- Railway production service `zesty-ambition` was online with no pending work
  or recent failures; deployment
  `197c8ae1-855e-47a1-aba5-246cdea0b55d` reported `SUCCESS`.
- The canonical `/api/version` endpoint served commit
  `ba6bb481889134b7f3e45bdbc8af6a7938b36508`. `/api/healthz` and
  `/api/readiness` returned HTTP 200.
- Readiness was true for database/schema, Redis/BullMQ, cloud storage, and the
  media worker. `media_platform_flag` was true and storage was marked required,
  consistent with the October 5 record of user-directed V21 activation.
- No deployment variable was changed and no production storage or media write
  was performed. This is a read-only readiness check, not a new media-flow or
  storage-I/O certification.

## Production storage I/O verification — October 6, 2026

- A reusable no-shell runner was built from the existing bounded storage
  certification helper and executed as a temporary non-HTTP Railway Function.
  The API service's variables, `MEDIA_PLATFORM_V21`, and existing media were
  not changed.
- The Function's staged patch contained only that new service and its seven
  variables. The five storage settings referenced the same
  `niakofa-production-media` bucket resource, and its configured bucket matched
  the independently verified S3 API bucket name
  `niakofa-production-media-mm-aha` before the client was created.
- The Function deployment
  `6866d04c-c542-49db-b4fc-913ccf5de9c0` succeeded. Its result was
  `ok=true`, `probe=put-head-get-delete`, `bytes=51`,
  `sha256=101306131e8d8f033a6efd2033d57aead5921eae850ba714e14c80b73a264448`,
  `deleted=true`, and `cleanup_attempts=1`. The result also confirmed the media
  platform flag was unchanged.
- At probe time the API service's latest successful deployment was
  `f3aca370-cbc9-45b6-ae96-fe4c32c93a7f`, serving application commit
  `e269127fa10e9530c5a3cdfa10792b1ba5cf1763`. This application revision is
  recorded separately from the later repository update that adds this runner
  and documentation.
- The temporary Function was removed. A subsequent environment read showed
  only the four existing production services, no probe Function, and no pending
  changes. The earlier October 6 one-off probe also passed and was removed.

This certifies only the temporary object's storage I/O and cleanup. It does not
certify media uploads, processing, retrieval authorization, or real-device
behavior, and it is not approval to change the already-enabled production flag.

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
