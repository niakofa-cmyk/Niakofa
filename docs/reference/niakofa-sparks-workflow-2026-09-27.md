# Sparks workflow: retained reference and implementation contract

This reference accompanies the Niakofa Sparks workflow rebuild. The original
14,967-byte brief and three image references remain in the workspace's ignored
`attached_assets/` directory at the owner's request. **Do not remove them until
the owner says today's work is done.** They are not copied into this public
repository: the screenshots include identifiable people and third-party social
media content. The descriptions below preserve their interaction intent
without republishing the images or copying another product's assets.

## Local reference inventory

| Source | What to use |
| --- | --- |
| `attached_assets/Pasted-Niakofa-Sparks-Complete-Workflow-Architecture-Rebuild-Y_1790567770683.txt` | Full 554-line product/architecture brief; distinguish its recommendations from certified implementation evidence. |
| `attached_assets/1000010438_1790567786782.jpg` | Mobile gallery-first creation: clear title, media selection, and capture entry. Niakofa's title is **Create Spark**. |
| `attached_assets/1000010440_1790567802384.jpg` | Full-height portrait editing preview with reachable tools and a clear audience/share step. Use Niakofa's own editor and controls. |
| `attached_assets/1000010413_1790567812173.jpg` | Home discovery rail with a prominent own-create action and neighbor items. Use approved community content and Niakofa styling. |

There was no new ZIP in this attachment batch. Older retained ZIP references
have their own audits and remain reference-only; never import their source,
schemas, assets, credentials, or deployment configuration into the app.

## Product and lifecycle contract

- A **Spark** is an individual short-form post; **Moments** is the place to
  experience ephemeral Sparks. A durable **Story** remains a different
  narrative concept. Existing Story API/records and legacy deep links must
  remain compatible while user-facing creation says **Create Spark**.
- The studio journey is capture or choose media, preview/edit, choose audience
  and destination, upload/process, then publish. Controls must be real:
  original audio may be offered, but unlicensed sample music must not appear
  playable; do not imply video trimming or effects were rendered if they were
  only previewed.
- Community Moments keep their existing 24-hour expiration. New listing-linked
  Exchange video should follow the approved listing's lifecycle and must not
  vanish solely because a 24-hour Moment expires. Existing listing-linked
  Story records remain backward-compatible; do not silently backfill or
  lengthen their old retention policy.
- Exchange discovery and every playback path must enforce active approved
  listing, seller approval, community audience, mutual blocks, media readiness,
  and generalized neighborhood location. Never expose exact pickup location,
  raw storage keys, or unapproved content.
- Use the existing private storage, media records, worker, authentication,
  deletion queue, and Nia boundary. Do not create a second media backend or
  couple Nia AI processing to Spark media.

## Media and release contract

- A signed S3/R2 PUT URL without a provider size condition is **not** a safe
  direct-upload policy. Keep bytes on an authenticated, size-bounded same-origin
  upload route unless a size-conditioned provider upload is actually verified.
- Client-side file checks do not replace server-side limits or storage-side
  enforcement. The upload flow needs visible progress, cancellation, retries,
  processing errors, and no duplicate publication on retries.
- Do not enable `MEDIA_PLATFORM_V21` based on build, lint, startup, or secret
  presence alone. Certify private bucket/CORS, queue delivery and recovery,
  FFmpeg output, authenticated playback, size rejection, deletion/orphan retry,
  and an actual approved-account draft-to-published round trip on the deployed
  revision. Record device/accessibility evidence in
  `docs/PRODUCTION_ACCEPTANCE_MATRIX.md` and `docs/IO_CERTIFICATION_RUNBOOK.md`.

## Current implementation boundary

- The Create Spark studio now has media selection/capture, editing, and a
  separate destination step. Linked single-video Exchange submissions use the
  new bounded binary flow; overlays and preview effects are deliberately
  rejected for that destination instead of being silently dropped.
- The Exchange feed reads both listing-owned durable videos and unexpired
  listing-linked legacy Moments, preserving each source's retention rules.
  Protected durable playback uses a short-lived, asset-scoped cookie grant and
  byte-range streaming. Draft expiry and account removal retain storage
  tombstones for retryable cleanup.
- **Not certified for production:** On 2026-09-28, the production
  `/api/healthz` response reported `media_platform_flag=true` both before
  and after this rebuild deployed. This was already enabled externally, not
  activated by this work. The deployed storage I/O, processing worker,
  authenticated upload/playback, deletion, and device journeys have not passed
  the release checks above. A healthy deployment and schema migration are not
  certification; do not infer that the live flag is safe from its current value.
- **Not completed:** ordinary Community/Hub Moments still send Base64 media
  through the legacy Story API; their direct-binary path and a dedicated
  vertical Moments browsing experience remain separate work. Legacy
  in-flight Exchange draft compatibility after enabling the new media flag,
  plus a moderator review path for held Exchange Spark captions, must also
  be resolved before enabling the durable flow in production.

## Initial source audit (before this rebuild)

The existing `CommunityStoryRail` presents a mostly Spark-labeled rail and a
single full-screen Story-backed composer with camera/gallery, overlays,
community/Hub audience, and optional Exchange listing. Its general upload
serializes media as Base64 JSON. `CommunityExchangeSparkComposer` has a
separate gated binary video draft/session/processing/publish path; the
`CommunityExchangeSparks` viewer already scrolls vertically and requests
authenticated playback. The two experiences need a coherent user journey.
The Exchange draft is still a 24-hour Story. The presigned storage PUT is not
provider-size-limited. These facts are implementation gaps, not reasons to
discard the existing permissions, media pipeline, or legacy records.

This document is an implementation reference, **not** a claim of production
certification. For the earlier media audit and outstanding operator evidence,
see `docs/reference/exchange-sparks-media-audit-2026-09-27.md`.