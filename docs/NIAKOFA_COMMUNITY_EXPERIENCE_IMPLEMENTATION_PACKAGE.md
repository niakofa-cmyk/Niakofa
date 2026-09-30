# Niakofa Community Experience — Implementation Package

## Mission

Niakofa is evolving into a community platform centered on mutual aid, belonging, cultural continuity, and a living Global Village. The Community architecture should make it easy for members to move from seeing what is happening now, to participating, gathering, communicating, and preserving what matters.

The implementation keeps the product vocabulary intentionally distinct from the mature persistence layer. The six primary Community destinations are:

**Home → Moments → People → Exchange → Notifications → Profile**

Messages remains a persistent header action. Spirals, Hubs, Requests, Services, Media, Diaspora, Family, and Legacy remain available as secondary destinations.

**Nia AI is separate from the core Community/social architecture.**

## Product Language

| Experience | Meaning |
|---|---|
| Home | Living Community Hub and feed |
| Moments | Short-form destination / experience |
| Sparks | Individual short-form expressions |
| Spirals | Community/group spaces; replaces Circles |
| Exchange | Goods, services, needs, and offers |
| Stories | Durable narratives |
| Legacy | Preserved cultural, family, and community memory |
| Messages | Persistent communication surface |
| Nia AI | Separate AI service and product boundary |

North-star model:

> A Spark is the expression. Moments is the experience. A Story is the narrative. A Legacy is what the community chooses to preserve. Spirals are where people gather.

## Architecture Guardrails

1. Preserve the existing Story API and database/media persistence boundary during the user-facing migration.
2. Preserve authenticated media behavior and authorization.
3. Preserve deep-link parameters when legacy routes normalize to canonical routes.
4. Keep Nia AI outside the Community social dependency graph.
5. Keep product vocabulary centralized so future terminology changes do not require broad string edits.
6. Treat Moments and Sparks as the user-facing short-form model while Stories remain the durable narrative model.
7. Maintain accessible, mobile-first immersive viewing and reduced-motion behavior.
8. Keep Messages out of the primary Community destination navigation while retaining direct header access.

## Implemented Code Package

### Canonical contract

artifacts/pay-it-forward/src/components/community/CommunityExperienceContract.ts

Centralizes primary navigation, canonical routes, legacy route aliases, product vocabulary, and migration safety principles.

### Compatibility layer

artifacts/pay-it-forward/src/components/community/CommunityMomentsMigration.ts

Maps Stories → Moments and Circles → Spirals and exposes stable constants used by current Community routing/tests.

### Community routing

artifacts/pay-it-forward/src/pages/community.tsx

Current behavior: Home renders the living Community experience; Moments renders the Moments destination; legacy /community/stories redirects to /community/moments; legacy /community/circles redirects to /community/spirals; sparkId is canonical for short-form deep links while storyId remains accepted for compatibility; Messages redirects to /messages.

### Moments experience

artifacts/pay-it-forward/src/components/community/CommunityMomentsView.tsx

Delegates to CommunityMomentsExperience, preserving the immersive viewer and current analytics boundary.

### Existing media/viewer infrastructure

The implementation continues to use CommunityMomentsExperience, CommunityStoryRail, CommunityStoryVisual, StoryViewerChrome, authenticated community story/media APIs, reduced-motion support, and viewport-aware media playback. These are retained deliberately rather than rewritten merely to change product vocabulary.

### Navigation

Primary Community navigation:
1. Home
2. Moments
3. People
4. Exchange
5. Notifications
6. Profile

Messages is available from the header. Spirals remains a secondary destination and is not a primary tab.

Secondary Community destinations include Hubs, Requests, Services, Spirals, Media, Diaspora, Family, and Legacy.

### Notification routing status

The canonical experience contract names `/notifications`, but the current Community shell still opens the Notifications drawer when its tab is selected, and the frontend does not yet register a first-class `/notifications` page. Preserve the drawer as quick access when adding that destination; do not claim route parity until the page and navigation behavior are implemented and tested.

## Testing Contract

The Community social contract verifies canonical primary navigation, Messages header behavior, legacy route normalization, Spark/Moments terminology, immersive viewer controls, reduced-motion support, Story API compatibility, deep-link preservation, authenticated media, profile authorization headers, gallery video previews, and the canonical architecture contract.

The Diaspora Community source contract verifies that the Stories wrapper points to CommunityMomentsView, preventing stale tests from forcing the obsolete CommunityStoriesExperience architecture back into the migration.

## Recommended Next Engineering Sequence

### Phase 1 — Stabilize
- Keep CI contracts aligned with canonical Community architecture.
- Continue typecheck, frontend tests, backend tests, migration tests, and release validation.
- Add route/deep-link browser coverage for Moments and Spirals.

### Phase 2 — Productize Sparks
- Give Sparks a first-class domain type at the UI layer.
- Add explicit Spark creation status, draft state, publish state, and visibility controls.
- Preserve the Story API adapter underneath until a measured data migration is justified.

### Phase 3 — Strengthen Spirals
- Add Spiral membership state, roles, moderation controls, pinned context, and community-level discovery.
- Keep Spiral identity independent from individual Spark content.

### Phase 4 — Connect Stories and Legacy
- Let members promote selected Sparks into durable Stories.
- Let Stories feed Legacy preservation workflows with explicit user consent.
- Maintain clear retention and privacy controls.

### Phase 5 — Separate Nia AI
- Keep AI requests behind the Nia service boundary.
- Prevent Community components from importing Nia service internals.
- Introduce AI-assisted discovery, summarization, or preservation only through explicit product contracts.

## Acceptance Criteria

The implementation is complete when:
- Community primary navigation consistently uses Home, Moments, People, Exchange, Notifications, Profile.
- Messages remains directly accessible from the header.
- Notifications is available as a full `/notifications` destination while the drawer remains available for quick access.
- Legacy Stories/Circles URLs continue to resolve without losing deep-link parameters.
- Sparks are the visible short-form content language.
- Stories remain available as durable narratives.
- Legacy remains the preservation layer.
- Authenticated media continues to work.
- Existing Story persistence remains intact.
- Nia AI remains independently deployable and architecturally separated.
- CI validates both the current architecture and the compatibility layer.

## Engineering Principle

Do not rebuild mature infrastructure simply because the product vocabulary changed.

Evolve the experience layer, centralize the vocabulary, preserve the durable API/media boundary, and migrate data only when the product and operational evidence justify it.
