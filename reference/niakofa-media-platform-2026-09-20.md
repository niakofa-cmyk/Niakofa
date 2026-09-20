# Niakofa media-platform reference record

Date: 2026-09-20  
Source materials: the two supplied Niakofa review documents, the Niakofa V21 foundation archive, and the Youwee reference archive.

## What was established

- The V21 package is an architectural scaffold, not a production-ready drop-in.
- Niakofa must use its existing `lib/db/migrations` location, `@workspace/db` schema barrel, storage abstraction, and BullMQ `createQueue()` factory.
- Production processing requires durable Redis, durable object storage, real FFmpeg/FFprobe work, thumbnail/variant verification, and idempotent database job records.
- Shared Media reads must authorize the actual context: direct-conversation membership, Story visibility, approved Hub membership, or request ownership/helper access.
- Existing Story and direct-message upload boundaries are the correct integration points; their legacy storage keys remain for compatibility.
- `audio_mix` stays fail-closed. No Youwee downloader, Tauri, Rust, filesystem crawler, scraper, or all-rights-reserved downloader code is imported.

## Decisions carried into the implementation

- The universal media foundation is additive and guarded by `MEDIA_PLATFORM_V21=1`; it remains disabled by default.
- Canonical assets reference an owner, context, original object key, optional thumbnail/variant keys, processing status, and durable idempotent jobs.
- Photo processing uses probe plus thumbnail; video processing uses probe, thumbnail, and an FFmpeg MP4 variant; audio is probe-only until a licensed mixer exists.
- Production startup rejects an enabled media platform without cloud object storage and verifies both FFmpeg and FFprobe before accepting traffic.
- Local disk storage remains available for development; production must provision cloud object storage before enabling the flag.

## Explicit non-goals

- No replacement of Niakofa’s database, queue, storage, auth, or monorepo structure.
- No fake media metadata, fake audio mixing, or silent fallback when the enabled processing infrastructure is unavailable.