# Niakofa Visual Discovery Reference

## Purpose

This document records the uploaded reference review and the independent
Niakofa-native implementation direction for Community → Media.

Niakofa Visual Discovery is not Pinterest inside Niakofa. It is a visual index
of approved community moments that always links back to a meaningful Hub post:
help completed, local projects, cultural memories, artwork, events, and oral
history.

## Reference review

### Recreated as product behavior

- Responsive visual media grid with progressive loading
- Cursor pagination
- Lazy authenticated media loading and skeleton states
- Search and media-type filtering
- Media cards with an originating community context
- Typed request/result boundaries and centralized response handling

### Explicitly not integrated

- Nuxt, Vue, Nitro, WooCommerce, WordPress, WPGraphQL, NuxtHub, or checkout
- Pinterest internal endpoints, scraping, parser code, or download behavior
- The Pinterest Downloader Studio external executable or download site
- Reference media, logos, credentials, deployment configuration, or database
  architecture

## Implementation boundary

The feature is an independent Niakofa recreation over existing approved Hub
posts and attached media. It uses the canonical React/Vite frontend, Express
API, existing Hub membership checks, moderation status, object storage, and
authenticated media routes. It does not enable the universal media platform
flag or bypass its production activation gate.

The media ZIPs remain outside the repository. The uploaded archives are
workspace reference inputs and are intentionally not staged or committed.

## Production acceptance notes

- The API only returns media for an approved canonical Hub and an approved
  member.
- The API only returns media attached to approved, visible Hub posts.
- Cursor pagination is based on the immutable media row id.
- Search is limited to the originating post body and is bounded at 120
  characters.
- Media continues to use authenticated same-origin fetching and object URLs;
  storage keys are never exposed to the browser.
- Real production media readiness still requires the existing storage, Redis,
  FFmpeg/FFprobe, variant, and authenticated acceptance gates.

> Independent Niakofa recreation: This feature was independently implemented
> from product requirements and observed reference behavior. No source code
> from an unlicensed reference was copied or embedded.