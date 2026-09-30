# Moments, Sparks, and Stories reference review

This record preserves the September 30, 2026 product references and the implementation audit. The image and prose are **directional references**, not a literal screen design or evidence that every depicted feature is live. The supplied recorder is reference-only; production behavior must be implemented and reviewed in Niakofa's own components.

## Supplied references

- [Product image](../../attached_assets/ChatGPT_Image_Sep_30,_2026,_08_39_20_AM_1790775824405.png)
- [PR-summary review and server recommendations](../../attached_assets/Pasted-What-I-could-see-from-the-PR-summaries-PR-77-Diaspora-G_1790776986108.txt)
- [Camera-recorder concept, reference only](../../attached_assets/SparksCameraRecorder_1790777009326.tsx)

Do not copy the image's competitor-derived labels into product copy. Do not show app-store badges before native apps exist or claim remix/rights-management support before it has an authorization, attribution, moderation, and licensing policy. The PR descriptions in the review document are claims to check against deployed behavior, not release certification.

## Scope and product distinctions

| Reference requirement | Current Niakofa disposition |
| --- | --- |
| Moments feed, discovery, playback, social interactions | Existing Community Moments experience, protected media playback, filters, reactions, comments, private replies, sharing, and creator insights. Test these as separate behaviors; a public comment is not a private reply. |
| Sparks creation/participation | The live portrait camera hands photos and individual clips to the Moment studio. Exchange Sparks are different: a listing-linked, moderated, **single-video** draft/publish contract. Do not silently feed a multi-clip Moment into the Exchange Spark endpoint. |
| Camera capture, pause, multiple clips, 60-second session, flip/torch/countdown | The camera supports capture and a six-item sequence. The September 30 improvement adds aggregate recorded-video time, guarded device controls, and interruption-safe clip handoff; physical iOS/Android device verification remains required. |
| Drafts, retries, upload progress, edit/trim/cover/music/templates/captions | The Moment studio and Exchange Spark drafts have distinct recovery paths. Moment studio includes cover, music rights declarations, templates, layers, accessibility text and captions. Chunk-offset upload and camera-only server composition are now implemented behind V21, but are **not live or production-certified**. |
| Story audience: Public, Friends, Custom | **Not implemented as depicted.** Current audience is approved Community or approved Hub. Do not label this internet-public or invent a Friends/Custom selector without a matching authorization model. |
| Allow replies, expiration, archive/preservation | Reply policy, expiring visibility, deletion cleanup, and private Family Vault preservation exist. A browsable creator Story archive/restore feature does not. Family preservation does not save expiring video bytes. |
| Privacy, report/block/mute/moderation | Existing Moment policy and Exchange moderation are separate. Keep protected playback and deletion fail-closed. |
| Remix, reuse, rights management | No general Remix workflow exists. Music rights attestation is narrower than comprehensive remix/asset rights management. |
| Creator analytics, engagement and upload/processing status | Moment creator insights and media-asset processing states exist; Exchange Spark creator analytics do not have equivalent coverage. |
| App-store badges | Not shown until actual native apps are available. |

## Server-side media gaps and release gates

1. Individual uploads already have server-side type/size verification, FFprobe duration checks, H.264/AAC transcoding with `+faststart`, and FFmpeg cover/thumbnail processing **when V21 is enabled and its worker is healthy**. The API also exposes media processing states; the client has draft/retry paths.
2. V21-gated camera-only multi-clip composition now retains original Story attachments and creates a separate durable, private MP4 reel. The server checks an explicit ordered 2–6-video intent, ownership and published Story attachment, and an aggregate 60-second limit; the worker normalizes audio/video (including silent inputs) and uses fenced, attempt-specific outputs. The client displays a ready reel as one logical frame. This is **locally implemented, not production-certified**; ordinary multi-slide Stories and single-video Exchange Sparks are unchanged.
3. V21-gated uploads now have a persisted, bounded 4 MiB chunk-offset protocol with per-chunk SHA-256, server-acknowledged progress, session recovery, duplicate-chunk checks, strict final assembly, and tracked chunk cleanup; the original one-shot PUT remains compatible. Local tests do not establish live bucket reliability or physical-device interruption recovery.
4. `MEDIA_PLATFORM_V21` must stay off until real production object-storage PUT/HEAD/DELETE certification, worker/Redis health, FFmpeg/FFprobe smoke, a privacy-preserving upload/playback/deletion run, and device validation pass. Configuration readiness alone does not certify the bucket. Do not activate a flag to mask incomplete media behavior.
5. The 60-second camera-session budget is distinct from the existing per-asset 60-second Story API limit: a Story can contain separate sequential media items. Do not impose a global API limit across independently authored Story items without a product/API decision.

The local FFmpeg/FFprobe synthetic clip test, API and web tests, typechecks, and the migration-first development startup passed. Production certification still requires the Railway **service-shell** object-storage PUT/HEAD/DELETE probe and FFmpeg/FFprobe probe in [`ops/RAILWAY_ONEOFF_PROBE.md`](../../ops/RAILWAY_ONEOFF_PROBE.md), explicit V21 activation only after those checks, a healthy Redis-backed media worker, authenticated disposable-account upload/playback/deletion acceptance, and real iOS/Android camera testing. A configured bucket name or a passing read-only health check is not a substitute for any of these.

## Production acceptance boundary

The canonical Railway domain and deployed application commit must be rechecked immediately before any run. Public SPA/API smoke checks are read-only. Authenticated acceptance needs an **approved, genuinely disposable** state saved only outside the repository with restricted permissions. An account label alone does not prove it is disposable; production mutation gates require explicit authorization and cleanup review. No credentials, storage state, or tokens belong in this record or the repository.

On September 30, two distinct, user-approved accounts passed the secure login and approved-state validator against the exact served production commit. The read-only browser check in [`e2e/community-moments-readonly.spec.ts`](../../e2e/community-moments-readonly.spec.ts) opened Community/Moments, fetched each account's authenticated Story feed, and confirmed anonymous access is rejected. Its temporary browser states and artifacts were removed. This **does not** certify camera hardware, upload, storage, processing, Story publication, or deletion. No production media was created, and V21 was not activated.

The guarded [resumable-upload and stitched-reel acceptance run](../../ops/media-v21-resume-compose-certification.md) is prepared but **has not been executed**. It requires separate Railway storage/toolchain certification and deliberate V21 activation before any disposable-account media writes; an approved account alone does not meet that gate.