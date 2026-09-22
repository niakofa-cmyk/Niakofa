# Niakofa — Unlicensed Reference Recreation Package

## Decision

The supplied unlicensed reference projects are REFERENCE MATERIAL ONLY.

Niakofa will NOT copy or embed their source code. We will independently recreate useful product behavior and visual/interaction concepts in Niakofa-native code.

### Sources covered
- fb-clone-main
- sociobook-main
- WigsStar-main

If an explicit license is later verified for a particular source, that source must still be reviewed for scope, attribution, notice, dependency, asset, and compatibility requirements before code is reused.

## Development model

Reference project → observe behavior/UX → write Niakofa requirements → independent Niakofa implementation → Niakofa tests/security review → production release gates.

## Improved and enhanced package direction

### Community Stories
Independently recreate and enhance useful patterns as a Niakofa-native Stories experience: first-class Stories navigation, Story author rail, visual discovery cards, immersive viewer, create Story entry point, gallery/camera selection, text/sticker/effect/mention tools, durable reactions, durable replies, share flow, authenticated media rendering, accessible focus behavior, mobile safe-area behavior, and loading/empty/error states.

Canonical implementation remains the existing CommunityStoriesExperience, CommunityStoryRail, CommunityStoryVisual, StoryViewerChrome, StoryComposerChrome, StoryGalleryChrome, and StoryMusicChrome architecture.

### Story media
Do not reproduce a reference upload/storage pipeline. Use the Niakofa media boundary: Story producer → MediaAsset → queue → FFmpeg/FFprobe where required → object storage → authenticated consumer.

Keep production media fail-closed until the existing storage, Redis, media-toolchain, variant, and authenticated acceptance gates pass.

### Music
Recreate the picker experience, not reference music assets. Target search, curated/trending sections, preview, selected-track state, artist/title metadata, and accessible playback controls. Use only audio Niakofa is authorized to use.

### Messaging
Reference projects may inform composition, reactions, headers, group presentation, attachments, call entry points, and empty/loading states. Keep Niakofa's Conversation Engine, durable realtime authority, authorization models, and attachment privacy rules canonical.

### Voice/video RTC
Reference call UIs may inform incoming/outgoing, connecting/ringing/active/ended states, mute/camera, screen share, participant presentation, and recovery/error states. Do NOT import another project's signaling backend. Niakofa production RTC remains LiveKit-based.

### Social interactions
Reference projects may inform independent Niakofa implementations of reactions, comments, notifications, relationship/request presentation, profiles, and responsive feed density. Data models and authorization remain Niakofa-native.

## Explicit prohibited transplant list

Do not copy or vendor from an unlicensed reference: React components, hooks, CSS/SCSS, source utilities, API routes, database migrations, schemas, authentication/session code, realtime signaling, Supabase/Firebase configuration, Prisma/MongoDB models, UploadThing configuration, deployment configuration, project credentials, API keys, signing keys/keystores, proprietary media, music/audio, images, or other copyrighted assets without verified rights.

## Implementation standard

What are we taking? A behavior, interaction idea, visual concept, or feature requirement.

What are we not taking? The reference project's source code, assets, backend, credentials, schema, or proprietary implementation.

How is Niakofa implementing it? With new code using Niakofa's existing contracts and architecture.

## Provenance language

Use this wording in future implementation notes:

> Independent Niakofa recreation: This feature was independently implemented from product requirements and observed reference behavior. No source code from an unlicensed reference project was copied or embedded.

Do not describe such work as ported from, copied from, forked from, or transplanted from an unlicensed source.

## Acceptance checklist

- [ ] No unlicensed reference source file was copied.
- [ ] No reference-project imports remain.
- [ ] No reference-project credentials/configuration remain.
- [ ] No source-specific database or auth architecture was introduced.
- [ ] No unlicensed media/audio/assets were introduced.
- [ ] Niakofa authorization is enforced.
- [ ] Niakofa privacy/media boundaries are preserved.
- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Relevant tests pass.
- [ ] Browser acceptance covers the recreated flow.
- [ ] Production certification is claimed only after the applicable production gate is actually executed.

## Current direction

The goal is not to reproduce another social application. The goal is to take useful product lessons from the references and build a stronger, more coherent, more accessible, distinctly Niakofa-native experience.