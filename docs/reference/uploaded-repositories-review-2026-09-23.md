# Uploaded repository review

**Reviewed:** 2026-09-23  
**Canonical implementation:** `artifacts/pay-it-forward/` and `artifacts/api-server/`

The uploaded ArtCODE, Transcendence, and Proxygen archives were extracted only
to a temporary review directory. Their files, assets, credentials, schemas,
authentication code, and deployment configuration were not copied into Niakofa.
The ZIP files remain untracked reference inputs and are intentionally not part
of the repository change.

## Archive findings

| Archive | Reviewed surface | Relevant independent patterns | Boundary |
| --- | --- | --- | --- |
| ArtCODE | PHP/SQLite image, music, news, novel, favorites, tags, search, albums, follows, private media, and admin surfaces | visual discovery, media grouping, bounded search/filter language, favorites as a future product signal | do not import PHP/SQLite, duplicated legacy templates, private-media handlers, or embedded configuration |
| Transcendence | Next.js/Prisma social schema, profile/boards/pins, follows/friendships, conversations/messages, notifications, Socket.IO presence, and PWA configuration | profile identity, durable conversation relationships, deduplicated notifications, reconnect-aware realtime as interaction references | do not import Next.js/Prisma, cookie/JWT auth, alternate socket identity, database schema, or external provider setup |
| Proxygen | C++ HTTP/HTTP2/HTTP3/QUIC/Fizz transport library, HTTP server, structured headers, and tests | future infrastructure reference only for transport concepts and protocol terminology | no application UX or Niakofa server replacement; do not copy C++ infrastructure into the React/Express stack |

A full text scan covered approximately 2,605 ArtCODE files, 146
Transcendence project files, and 1,249 Proxygen files. Credential-shaped
patterns were identified for review without copying their values.

## Niakofa decisions

- Keep Niakofa’s React/Vite, Express/OpenAPI/Zod, Drizzle/PostgreSQL/PostGIS,
  object-storage, Redis/BullMQ, LiveKit, and existing authentication boundaries.
- Keep Community Media as an authenticated, Hub-scoped visual index rather than
  an independent social database or Pinterest-style downloader.
- Measure four bounded Community Media moments through the existing
  `VITE_POSTHOG_KEY` build-time configuration: gallery page delivery, media
  filter changes, cursor-page delivery, and opening the originating Hub post.
- Analytics sends Hub/media IDs, media types, counts, pagination state, and a
  boolean indicating whether a search was applied. It never sends search text,
  post bodies, author names, avatars, or other profile content.
- The profile completed-request fetch already uses `authHeaders()`. Production
  confirmation still requires the canonical Railway host to serve the verified
  commit and an approved disposable authenticated session.

## Reference-only rule

These archives informed behavior-level decisions only. Any future feature
inspired by them must be independently implemented against Niakofa’s existing
contracts and reviewed for licensing, credential, privacy, authorization, and
production-readiness boundaries before release.

## Pixora, Postnisin, and Photobooth follow-up audit

**Reviewed:** 2026-09-24
**Temporary review directory:** `/tmp/niakofa-reference-audit-20260924/`

The three newly supplied ZIPs were path-checked and extracted only to the
temporary review directory. The original archives remain untracked attachment
inputs and are not part of the repository, GitHub, or Railway.

| Archive | Evidence reviewed | Selective Niakofa use | Do not import |
| --- | --- | --- | --- |
| Pixora-main | 233 archive files; Next.js frontend; Express/Mongoose backend; image, collection, follow, like, favorite, comment, notification, search, profile, upload, and moderation surfaces | media-card hierarchy, upload/publish steps, metadata/collection concepts, responsive discovery, thumbnail-first presentation | MongoDB/Mongoose, Cloudinary, JWT/NextAuth, alternate user model, backend routes, bundled images, and deployment configuration |
| postnisin-socialmedia-master | 61 archive files; Apache-2.0 license; React/Tailwind masonry feed, pin detail, comments, profiles, search, and Sanity studio/client | post composition flow, detail-to-related-content flow, masonry interaction language, accessible save/detail affordances | Sanity, Sanity schemas/client/tokens, Google/Sanity auth, asset storage, and its application shell |
| photobooth-master | 39 archive files; Next.js/Pexels gallery, search results, infinite loading, masonry, modal preview, and image-card hover behavior; no license file present in the archive | visual rhythm for galleries, progressive discovery, quick preview, loading/empty states | Pexels API dependency/key, Next.js shell, external image retrieval model, and bundled assets |

Credential-shaped values and provider references were scanned without copying
their values into the repository or chat. Because license coverage is
incomplete or asset-specific, all three remain behavior references even where
the source repository includes a license file.

## Independent enhancement applied

Community Media now uses Niakofa's existing authenticated thumbnail variant for
gallery cards and provides an accessible quick-view dialog with previous/next
navigation, save state, and a link back to the originating Hub post. This is a
new Niakofa implementation: it adds no new provider, database, auth, storage,
realtime, or deployment boundary.