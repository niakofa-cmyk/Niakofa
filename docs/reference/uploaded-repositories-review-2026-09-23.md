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