# Niakofa ZIP donor-pattern map

**Reviewed:** 2026-09-23  
**Purpose:** Translate the strongest behavior and design ideas from the uploaded
ArtCODE, Transcendence/PinSpace, and Proxygen archives into independent Niakofa
product decisions without changing Niakofa's architecture.

This is a planning and boundary document. It does not import source code, assets,
schemas, credentials, authentication, deployment configuration, or services from
the archives. The uploaded ZIPs remain reference-only workspace inputs and are
not part of the repository.

## Decision summary

1. **ArtCODE is the best immediate product donor** for Community Media discovery:
   grouping, bounded filtering, tags, collections, and a future save signal.
2. **Transcendence/PinSpace is the best interaction donor** for durable
   relationships, conversation state, notification deduplication, and presence
   cues.
3. **Proxygen is an infrastructure review donor only.** Its useful contribution
   is vocabulary for lifecycle boundaries and protocol tests, not a C++ server.
4. Niakofa remains the system of record for Hubs, Requests, Helpers, Circles,
   Stories, Messages, Diaspora, Family, media authorization, and realtime.
5. Any future feature must be independently implemented through the existing
   React/Vite + Express/OpenAPI/Zod + Drizzle/PostgreSQL boundary, with
   PostGIS used when available and the explicit Haversine fallback preserved,
   plus the object-storage/Redis/BullMQ/LiveKit boundaries. Redis/BullMQ is
   required for production workers; development-only scheduler fallbacks are
   explicit and are not production substitutes.

## Existing Niakofa foundation

| Capability | Current Niakofa evidence | Assessment |
| --- | --- | --- |
| Social-home hierarchy | `artifacts/pay-it-forward/src/components/community/CommunitySocialShell.tsx` | **Covered.** Feed, Stories, People, Messages, Notifications, Profile, and secondary Niakofa destinations already have an intentional hierarchy. |
| Hub-scoped feed | `artifacts/api-server/src/routes/community-hub-feed.ts`; `artifacts/pay-it-forward/src/components/community/HubCommunityFeedPanel.tsx` | **Covered.** Posts, gratitude, open requests, media, comments, reactions, sharing, bounded reads, membership checks, and moderation are Hub-native. |
| Community visual discovery | `artifacts/pay-it-forward/src/components/community/CommunityDiscoveryViews.tsx`; `artifacts/pay-it-forward/src/lib/communityVisualDiscovery.ts` | **Covered with deliberate limits.** Authenticated media, search, type filters, cursor pagination, lazy loading, and originating-post context are present. |
| One media pipeline | `lib/db/src/schema/media-assets.ts`; `docs/NIAKOFA_VISUAL_DISCOVERY_REFERENCE.md` | **Covered.** Media is validated, processed, attached to a domain object, and served through an authenticated same-origin route. |
| Stories and story interactions | `lib/db/src/schema/community-stories.ts`; `artifacts/api-server/src/routes/community-stories.ts`; `artifacts/api-server/src/routes/community-story-interactions.ts` | **Covered.** Stories have expiry, Hub/community scope, media/elements, views, reactions, and shares. |
| Direct messaging and unread state | `artifacts/api-server/src/routes/direct-messages.ts`; `artifacts/api-server/src/routes/messages-social.ts`; `artifacts/api-server/src/routes/messages-unread-summary.ts` | **Covered/partial.** The core conversation, attachment, read, block, and delivery boundaries exist; richer social relationship semantics remain a product choice. |
| Notifications and realtime | `artifacts/api-server/src/lib/message-notifications.ts`; `artifacts/api-server/src/workers/notification-worker.ts`; `artifacts/api-server/src/lib/ws-hub.ts` | **Covered/partial.** Durable notification and WebSocket plumbing exists; acceptance should continue to prove canonical persistence before fan-out and reconnect convergence. |
| People discovery | `artifacts/pay-it-forward/src/components/community/CommunityDiscoveryViews.tsx`; `artifacts/api-server/src/routes/users.ts`; `lib/db/src/schema/users.ts` | **Partial.** People currently derive primarily from recent Hub activity and helper-oriented profiles, not a full relationship graph. |

## Donor pattern matrix

Status meanings:

- **Covered:** Niakofa already provides the behavior through its own model.
- **Partial:** The useful behavior exists but is narrower, or the product
  semantics are not yet decided.
- **Candidate:** Worth considering as an independently implemented Niakofa
  feature after product and production review.
- **Defer:** Useful only after a real need appears.
- **Reject:** Conflicts with Niakofa's boundaries or creates unnecessary risk.

### ArtCODE — visual discovery and collections

Reference areas included grouped media/search/tag/album/favorite behavior such as
`search/index.php`, `tag/index.php`, `albums/index.php`, `favorites/index.php`,
and `profile/index.php`.

| Donor pattern | Niakofa mapping | Status | Recommendation |
| --- | --- | --- | --- |
| Grouped visual discovery with bounded search and filters | Community Media, `CommunityDiscoveryViews.tsx`, `communityVisualDiscovery.ts` | **Covered** | Keep the Hub scope, cursor pagination, media-type filters, bounded query, and originating-post link. Do not broaden into an unscoped global gallery without an authorization design. |
| Collections/albums as meaningful groups | Community Media, Stories, Family Memories, Diaspora, and Hub posts | **Partial** | If users need this, design a Niakofa-native collection concept first. Prefer a domain-owned collection type or existing Hub/story context over copying an album schema. |
| Favorites/save as a lightweight return signal | No generic Community Media save/bookmark model found | **Candidate** | Consider a durable save signal only after deciding whether saved items are private, Hub-visible, or shareable. Add uniqueness, authorization, bounded listing, and privacy tests together. |
| Tags/hashtags as discovery controls | Media filters exist; no generic community tag contract is established | **Candidate** | Add only if a real discovery problem is demonstrated. Define normalization, moderation, Hub scope, and query bounds before adding a tag table or API. |
| Multi-image storytelling and media grouping | `media_assets`, `community_story_media`, and story composition manifest | **Covered/partial** | Reuse the existing media asset and story-media relationships. Do not create a second upload or storage pipeline. |
| Curated feeds and moderation surfaces | Hub feed moderation and Community Media visibility rules | **Covered/partial** | Keep editorial/curation decisions inside Hub moderation and approved-post visibility; do not import ArtCODE admin pages. |
| Private media handlers, downloader behavior, PHP/SQLite templates | No Niakofa equivalent by design | **Reject** | Do not copy `private_image.php`, private upload handlers, scraping/downloader behavior, PHP templates, embedded config, or SQLite schema. |

**ArtCODE priority:** Community Media save/collection discovery is the strongest
future product slice, but it requires a product decision about visibility before
any schema work.

### Transcendence/PinSpace — relationships and interaction state

Reference areas included `Project/prisma/schema.prisma`, friend/follow routes,
conversation/message routes, notification routes, `Project/lib/socket.ts`,
and the feed/profile/notifications UI.

| Donor pattern | Niakofa mapping | Status | Recommendation |
| --- | --- | --- | --- |
| Clear profile identity and activity context | Users, helper profiles, Hub authors, Community shell | **Covered/partial** | Continue improving profile and People surfaces through Niakofa's user and Hub authorization model. Avoid treating every social profile as a generic public directory. |
| Follow vs friend/request distinctions | Hubs, Hub memberships, Helpers, Requests, Diaspora, Circles, and existing blocks | **Partial** | Decide which relationship types users actually need. Prefer explicit Niakofa relationships over a universal friend graph or a new graph database. |
| Conversation lifecycle, unread counts, read receipts | Direct Messages routes, unread summary, attachment and read-state handling | **Covered/partial** | Preserve the existing conversation engine. Borrow the interaction clarity, not the Prisma model or route structure. |
| Notification persistence, deduplication, and cleanup | Message notification schema/lib and notification worker | **Covered/partial** | Keep notifications durable and server-owned. Add regression coverage for idempotency, read state, bounded delivery, and cleanup where gaps remain. |
| Presence and reconnect-aware UX | WebSocket hub/client; LiveKit for Circle media | **Partial** | Use WebSocket lifecycle and the existing LiveKit boundary. Presence is a hint, never the source of truth for messages, membership, or media connectivity. |
| Separate post/reaction/comment/mention/share/repost/save events | Hub feed and story interactions cover several events; generic save/repost/mention primitives are not universal | **Partial** | If new events are added, persist each canonical event before notification/realtime fan-out and give each event its own authorization and uniqueness rules. |
| Boards/Pins as a social content model | Hub posts, Community Media, Stories, Family Memories | **Partial** | Borrow the organizing idea only where it maps to an existing Niakofa context. Do not introduce a Pinterest clone or a second social database. |
| Next.js/Prisma routes, cookie/JWT/NextAuth, Socket.IO, Pusher, Vercel Blob, ELK, alternate providers | Existing Niakofa boundaries | **Reject** | Recreate desired behavior independently in the current monorepo. Never copy auth, schemas, credentials, provider setup, or socket identity. |

**Transcendence priority:** strengthen canonical event, notification, and
reconnect acceptance around existing Messages and Community interactions before
adding a new relationship type.

### Proxygen — lifecycle and protocol discipline

Reference areas included `proxygen/README.md`, structured-header
encoder/decoder code, HTTP session/priority queue code, coroutine server
boundaries, and HTTP message tests.

| Donor pattern | Niakofa mapping | Status | Recommendation |
| --- | --- | --- | --- |
| Explicit request lifecycle and layered handlers | Express route → OpenAPI/Zod contract → service/storage boundary | **Covered/partial** | Use as a review lens for route ownership, cleanup, errors, and observability. Keep the Node/Express implementation. |
| Structured protocol validation | OpenAPI schemas, generated Zod types, route tests | **Covered/partial** | Add targeted contract tests when a route or event shape changes. Keep validation at the API boundary. |
| Test-heavy transport and session edge cases | API Jest suites, WebSocket/LiveKit tests, production gates | **Covered/partial** | Borrow the discipline: test lifecycle transitions, malformed input, cleanup, timeouts, and replay/reconnect behavior. |
| HTTP/2, HTTP/3, QUIC, Fizz, and C++ server replacement | Railway Node service and existing API boundary | **Defer/reject** | Investigate only after a measured production bottleneck justifies it. Do not add a C++ service or replace Express. |
| Test certificates, keys, build system, and infrastructure subtree | Niakofa deployment and secret boundaries | **Reject** | Never copy certificates, keys, build files, dependencies, or provider configuration. |

**Proxygen priority:** future review prompts only. It is not a product
implementation dependency.

## Recommended independent implementation slices

These are ordered by value and risk. They are not commitments to implement all
of them.

### P0 — preserve the boundaries

- Keep Community Media authenticated, Hub-scoped, cursor-paginated, and linked
  to an approved originating post.
- Keep all media behind the existing MediaAsset/object-storage pipeline and
  production activation gates.
- Persist canonical state before WebSocket, notification, or analytics fan-out.
- Keep private/profile/search content out of bounded analytics payloads.
- Reject alternate auth, database, service-discovery, socket, and storage
  systems from the reference archives.

### P1 — highest-value product/test work

1. **Community Media save signal**
   - Decide whether saves are private, Hub-visible, or shareable.
   - Model uniqueness and ownership in `lib/db`, then expose a contract-first
     API and UI action through the existing Community Media surface.
   - Add bounded analytics without sending search text or profile content.
2. **Canonical event and notification acceptance**
   - Exercise post/comment/reaction/message transitions through persistence,
     notification delivery, realtime updates, reconnect, and replay.
   - Keep tests near the existing API, worker, WebSocket, and frontend contract
     suites rather than introducing a new event platform.
3. **People discovery decision**
   - Decide whether Hub activity-derived People is enough or whether a
     Niakofa-specific relationship such as follow/subscribe is needed.
   - If needed, define privacy, block, membership, pagination, and
     authorization behavior before adding schema or UI.

### P2 — later, evidence-driven work

- Tags/hashtags or collections if Community Media usage demonstrates a real
  retrieval problem.
- More complete profile activity and relationship views.
- Transport/lifecycle hardening prompted by measured production behavior, using
  the Proxygen concepts only as review vocabulary.

## Implementation and release checklist

Before implementing any candidate from this map:

- [ ] Confirm the user-visible problem and choose one Niakofa domain owner.
- [ ] Reuse existing OpenAPI/Zod, Drizzle/PostgreSQL, auth, storage, and
      worker/realtime contracts.
- [ ] Define membership, privacy, moderation, block, and authorization rules.
- [ ] Add uniqueness, bounded pagination, and malformed-input tests.
- [ ] Persist canonical state before notifications, WebSocket delivery, or
      analytics.
- [ ] Keep analytics bounded to IDs, kinds, counts, and state—not content or
      profile data.
- [ ] Recheck media storage, variants, Redis/BullMQ, FFmpeg/FFprobe, and
      authenticated playback gates when media is involved.
- [ ] Recheck archive licensing before reusing any asset or source fragment.
- [ ] Verify the served commit and production acceptance path before release.

## Assessment reconciliation

The uploaded assessment is a useful product-direction review, not a claim that
every donor pattern is already a Niakofa requirement. The current status is:

| Assessment area | Current status | Boundary |
| --- | --- | --- |
| React/Vite/TypeScript, Express, typed OpenAPI/Zod, PostgreSQL, media, Redis/BullMQ, LiveKit, and Playwright | **Implemented** | PostgreSQL may run without PostGIS through the tested Haversine fallback; Redis/BullMQ is a production gate and development has explicit degraded paths. |
| Social home, Stories, Hub posts, comments, reactions, authenticated media, sharing, search, and curated Spirals | **Implemented** | These remain Hub/member-scoped Niakofa surfaces, not a copied Pinterest/Netscapes application. |
| Category-based help discovery from the Skills Directory | **Implemented** | The existing request contract now accepts category filtering and Requests Center preserves/clears category context. |
| Personalized recommendations, creator/topic follows, boards/collections, cross-Hub search, and community events | **Deferred product candidates** | No source or schema from the reference archives is imported. Implement only after a specific user need, privacy model, and bounded API contract are approved. |
| Public restaurant storefront, catalog, modifiers, cart, reservations, and restaurant checkout | **Not part of the current product surface** | Existing business accounts, helper services, requests, and Stripe/Pay It Forward rails are adjacent primitives. Do not introduce a second storefront architecture without a separate product decision. |
| Railway deployment/resource names and live SUCCESS state | **External evidence only** | Repository source proves deployment configuration, not current Railway health or resource state. Verify the canonical deployed host and served commit through the production release gate. |

The `artifacts/circles-visual-reference/` package is explicitly marked as
non-production, uses mock state, has a reference-only build, and remains
excluded from the root product build.

## Source and boundary notes

- Existing review: `docs/reference/uploaded-repositories-review-2026-09-23.md`
- Existing visual-discovery direction:
  `docs/NIAKOFA_VISUAL_DISCOVERY_REFERENCE.md`
- Existing Community social-home direction:
  `docs/COMMUNITY_SOCIAL_HOME_REFERENCE.md`
- Existing social reference decisions:
  `reference/niakofa-social-reference-review-2026-09-23.md`
- The archives were used to compare behavior and architecture only. No archive
  file is a Niakofa source dependency.

## 2026-09-24 storefront-reference update

The newly reviewed DoorDash, Sushi, and Bsetec archives remain reference-only.
Sushi is the useful interaction donor: responsive sheets, progressive detail,
option-style forms, persistent action trays, and explicit loading/error/empty
states. DoorDash contributes only conceptual dispatch/status language, while
Bsetec is limited to media/CDN/edge review ideas.

Niakofa's independent implementation is the community-map request flow:
nearby open requests now appear as privacy-safe Neighbor request markers,
contextual detail-sheet previews, panel rows, and accessible list rows. Each
surface hands off to `/request/:id/view`; no alternate provider, cart,
restaurant model, credential, asset, storage system, or deployment boundary
was introduced.

## 2026-09-24 media/social reference update

- **Pixora:** primary behavior reference for media upload/publish steps,
  metadata, collections, cards, search, and moderation-aware discovery.
- **Postnisin Social Media:** primary behavior reference for social composition,
  masonry feed presentation, post detail, comments, profiles, and related
  content. Its Sanity architecture is explicitly rejected.
- **Photobooth:** visual-only reference for masonry rhythm, progressive loading,
  search, and quick preview. Its Pexels dependency is explicitly rejected.
- **Implemented independently:** Community Media uses the existing authenticated
  thumbnail route for cards and an accessible quick-view dialog that keeps the
  originating Hub context and private save behavior.