# Exchange Sparks: media audit and reference boundaries

This review uses the two uploaded Exchange/media text notes. Earlier notes
named Niakofa Community Stories and Community Social Architecture ZIPs, but
neither archive was present in this checkout or opened during this review.
Those names remain reference-only; do not import third-party source, assets,
credentials, schemas, auth, or backend configuration into the application.

## Canonical product boundary

- Niakofa's web Community already calls its 24-hour Stories **Moments** and
  individual posts **Sparks**. Exchange already has listing approval,
  neighborhood-based discovery, and private pickup coordination.
- The second text note's Supabase tables, public media links, Expo camera
  components, Base64 storage upload, and SQL cron job do not fit this app.
  Exchange video belongs in the existing authenticated Story/media/storage
  pipeline. The proposed subsidy badge is not an approved product change.
- A listing's existing coarse discovery location should determine its
  Spark's discoverability. Never collect or expose a more precise video
  location or publicly expose media object keys.
- Keep the existing Story API/records and 24-hour retention compatible.
  Broad universal-media activation is a separate release decision.

## Read-only production observations

Railway's production environment currently reports a successful application
deployment, a Redis service, and two live media buckets. Its application
configuration lists storage, Redis, and media-flag variable **names**, but
their values and the bucket selected by the running storage adapter were not
read or independently certified. The deployment log search for media found
FFmpeg/FFprobe startup verification messages, not a successful authenticated
upload/transcode/playback round trip.

At review time, Railway's 24-hour HTTP rollup showed **0 5xx in 1,517
requests**, with **149 4xx**. A seven-day path-scoped rollup showed **183
requests and 0 5xx** for `/api/community/stories`, **0 requests** for
`/api/media-assets/uploads`, and **21 requests with 6 4xx and 0 5xx** for
`/api/community/exchange/listings`. Recent filtered deployment logs did not
identify a media error. These aggregates neither explain the 4xx responses
nor establish that universal uploads or video variants work in production.
No live data, service settings, or flags were modified for this audit.

## Release boundary

Exchange Sparks now has a listing-linked 24-hour Story feed, a bounded
legacy Story composer, authenticated byte-range playback, and a separate
direct-binary draft/upload/process/publish path. The direct path uses the
existing universal-media upload session and worker. It is intentionally
gated by `MEDIA_PLATFORM_V21`, cloud storage readiness, and the processing
queue; the existing Story upload still serializes bounded media as Base64
JSON when that path is unavailable.

**Do not enable the universal-media flag solely because the local checks
pass.** Its presigned PUT does not enforce an object-size limit at the
storage provider. API and worker reads are now bounded, but the bucket can
still receive oversized bytes while a signed URL remains valid; configure
provider-side enforcement or switch to a size-conditioned upload policy
before production activation. Also verify a private production bucket,
browser PUT CORS, Redis delivery/recovery, FFmpeg output, authenticated
native playback, deletion/retry behavior, and an actual draft-to-published
round trip. A runtime toolchain log, configured bucket, healthy HTTP
endpoint, or analytics event alone is not sufficient. See
`docs/PRODUCTION_ACCEPTANCE_MATRIX.md` and
`docs/IO_CERTIFICATION_RUNBOOK.md` for the existing operator gates.

The frontend's optional PostHog interaction events are not operational
media-error metrics. Do not use, copy, log, or embed the one-time
`VITE_POSTHOG_KEY` from this review. Replit Secret deletion remains a
separate owner action if it cannot be performed through supported tooling.