# Community Stories enhanced implementation — 2026-09-19

This reference records the integration of the uploaded Community Stories
enhancement package into the Niakofa monorepo.

## Canonical architecture

The implementation preserves the production-safe boundary:

```text
Community → Story → media/elements → durable interactions → Messages
```

Community Stories remain owned by the Community API. Messages consumes a
validated Story context; Stories are not reintroduced as a message subtype.
The implementation does not restore `message_stories` or
`/api/messages/stories`.

## Integrated client capabilities

- Safe object URL lifecycle for Story composer previews and fetched media.
- Item-by-item Story playback with photo progress and video-ended advancement.
- Persisted text, sticker, mention, music metadata, and effect element rendering.
- Client validation aligned with the server's 12 MB media limit.
- Durable view, reaction, reaction removal, and share API helpers.
- Recipient search and Story-to-direct-message share sheet.
- Correct `story_id` context payload for the existing direct-message contract.
- Existing shared-media and RTC work remains separate from this Story pass.

## Deliberately incomplete infrastructure

Music remains metadata until a licensed catalog and server-side audio mixing
pipeline exist. Effects are preview filters until media transcoding/baking is
available. These limitations are stated in the creator UI rather than being
represented as completed media processing.

The exact uploaded architecture review and enhancement ZIP are preserved under
`attached_assets/` and are included as project references when changes are
staged. The archive's original README, integration notes, status notes, patch
description, and contract test remain available there.

## Verification

Run:

```sh
node --test tests/community-story-enhanced.contract.test.mjs
pnpm run typecheck
pnpm --filter @workspace/pay-it-forward run build
```