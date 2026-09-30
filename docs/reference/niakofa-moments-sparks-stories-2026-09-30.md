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
| Drafts, retries, upload progress, edit/trim/cover/music/templates/captions | The Moment studio and Exchange Spark drafts have distinct recovery paths. Moment studio includes cover, music rights declarations, templates, layers, accessibility text and captions. These controls are **not** equivalent to completed server-side clip composition or true byte-range resumable upload. |
| Story audience: Public, Friends, Custom | **Not implemented as depicted.** Current audience is approved Community or approved Hub. Do not label this internet-public or invent a Friends/Custom selector without a matching authorization model. |
| Allow replies, expiration, archive/preservation | Reply policy, expiring visibility, deletion cleanup, and private Family Vault preservation exist. A browsable creator Story archive/restore feature does not. Family preservation does not save expiring video bytes. |
| Privacy, report/block/mute/moderation | Existing Moment policy and Exchange moderation are separate. Keep protected playback and deletion fail-closed. |
| Remix, reuse, rights management | No general Remix workflow exists. Music rights attestation is narrower than comprehensive remix/asset rights management. |
| Creator analytics, engagement and upload/processing status | Moment creator insights and media-asset processing states exist; Exchange Spark creator analytics do not have equivalent coverage. |
| App-store badges | Not shown until actual native apps are available. |

## Server-side media gaps and release gates

1. Individual uploads already have server-side type/size verification, FFprobe duration checks, H.264/AAC transcoding with `+faststart`, and FFmpeg cover/thumbnail processing **when V21 is enabled and its worker is healthy**. The API also exposes media processing states; the client has draft/retry paths.
2. Multi-clip uploads currently remain separate story assets. A single concatenated video with normalized audio is **not** produced. Add a durable composition job and associated ownership/authorization, ordering, aggregate duration, retry, cleanup, and playback tests before presenting that as a feature. Do not concatenate browser blobs.
3. The current retry behavior reuploads a whole file; there is no chunk-offset/resume protocol. A genuine resumable design needs bounded chunks, integrity validation, idempotent completion, abandoned-upload cleanup, and end-to-end interruption tests.
4. `MEDIA_PLATFORM_V21` must stay off until real production object-storage PUT/HEAD/DELETE certification, worker/Redis health, FFmpeg/FFprobe smoke, a privacy-preserving upload/playback/deletion run, and device validation pass. Configuration readiness alone does not certify the bucket. Do not activate a flag to mask incomplete media behavior.
5. The 60-second camera-session budget is distinct from the existing per-asset 60-second Story API limit: a Story can contain separate sequential media items. Do not impose a global API limit across independently authored Story items without a product/API decision.

## Production acceptance boundary

The canonical Railway domain and deployed application commit must be rechecked immediately before any run. Public SPA/API smoke checks are read-only. Authenticated acceptance needs an **approved, genuinely disposable** state saved only outside the repository with restricted permissions. An account label alone does not prove it is disposable; production mutation gates require explicit authorization and cleanup review. No credentials, storage state, or tokens belong in this record or the repository.