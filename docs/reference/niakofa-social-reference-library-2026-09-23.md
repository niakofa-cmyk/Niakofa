# Niakofa social reference library

**Reviewed:** 2026-09-23
**Canonical implementation:** `artifacts/pay-it-forward/` and `artifacts/api-server/`

This note records the product and UX conclusions from the uploaded social
references. The uploaded ZIP archives remain reference-only in the workspace;
none of their source, assets, credentials, schemas, or backend configuration
are copied into Niakofa, and no ZIP archive is added to this change.

## Reference decisions

| Reference | Use selectively | Do not import |
| --- | --- | --- |
| FanBase | People/entity-centered communities, discovery, events/activity | Firebase, old iOS controllers, legacy social APIs, embedded secrets |
| Funbase | Creator/community profiles, media discovery, search, future services/marketplace patterns | NextAuth, Prisma, Supabase, UploadThing, Mux, Stripe stack |
| SayOut | Simple audience and privacy language; lightweight public/friends/community visibility | Go/Fiber, SQLite, JWT architecture, Docker/Caddy runtime |
| Twitter Clone | Feed/reply/share mechanics, social discovery, notifications, role-aware permissions | Angular/Spring Boot/MySQL backend, alternate auth and routing |

## Niakofa product direction

Community should combine:

- a focused Home surface with Stories first, a compact “What’s on your
  mind?” composer, and a single-column Hub feed;
- people and Hub discovery without inventing membership from location;
- Stories, photos, video, replies, sharing, and authenticated media;
- requests, services, Spirals, Diaspora, Messages, and notifications as
  connected secondary systems rather than competing persistent tabs;
- server-owned visibility, moderation, authorization, durable realtime, and
  the existing PostgreSQL/PostGIS, media, LiveKit, and payment boundaries.

## Current implementation boundary

The canonical app already owns the feed, Stories, Hub membership checks,
comments, reactions, media, sharing, search, notification deep links, and
authenticated same-origin media reads. The social references therefore inform
surface hierarchy and interaction language; they do not justify adding a
second database, auth provider, media pipeline, notification system, or
backend.

This review also closed two surface/realtime gaps:

1. Home now places compact Stories before the post composer and feed.
2. Approved Hub post media, comment, and reaction mutations emit the
   canonical Hub post update event so connected members refresh their feed.

## Security and licensing notes

Reference material is untrusted input. Credential-shaped values were scanned
without copying matching content into the repository or chat. Any future
source reuse must be independently recreated unless its license and required
notices are explicitly cleared; the preferred approach is to implement the
behavior in Niakofa’s existing contracts.