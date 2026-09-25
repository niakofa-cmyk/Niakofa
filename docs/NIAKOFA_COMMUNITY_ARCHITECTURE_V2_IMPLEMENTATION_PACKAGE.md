# Niakofa Community Architecture V2 — Implementation Package

## Purpose

This package defines the production-facing Community architecture after the Stories → Moments, Circles → Spirals evolution.

Niakofa's mission is to build a living Global Village centered on mutual aid, belonging, cultural continuity, family/community memory, and participation. The Community layer should make it easy for a member to discover what is happening, express themselves, gather with others, communicate, and preserve what matters.

## North-star model

> A Spark is the expression. Moments is the experience. A Story is the narrative. A Legacy is what the community chooses to preserve. Spirals are where people gather.

## Canonical hierarchy

**Home → Moments → Spirals → People → Notifications**

**Messages** remains a persistent header action.

**Nia AI** remains a separate service/product boundary and must not become a dependency of Community social components.

## Current repository architecture

| Layer | Current implementation |
|---|---|
| Community shell | CommunitySocialShell.tsx |
| Community router | pages/community.tsx |
| Canonical contract | CommunityExperienceContract.ts |
| Migration adapter | CommunityMomentsMigration.ts |
| Moments destination | CommunityMomentsView.tsx → CommunityMomentsExperience |
| Compatibility wrapper | CommunityStoriesView.tsx → CommunityMomentsView |
| Mature persistence/media | /api/community/stories and existing Story/media infrastructure |
| Group model | Spirals |
| Durable narratives | Stories |
| Preservation | Legacy |
| AI boundary | Nia service |

## Migration rules

1. Do not rename or delete the mature Story persistence/API boundary merely because the UI vocabulary changed.
2. /community/stories resolves to /community/moments.
3. /community/circles resolves to /community/spirals.
4. Query parameters are preserved during legacy-route normalization.
5. sparkId is canonical for short-form deep links; storyId remains accepted as a compatibility alias.
6. Authenticated media and authorization behavior remain intact.
7. Messages stays available from the header but is not a primary Community destination.
8. Product vocabulary is centralized in CommunityExperienceContract.ts.

## Improvements implemented

### 1. Centralized route normalization

The Community contract now owns legacy section aliases, canonical route generation, primary navigation membership checks, canonical product vocabulary, and migration safety principles.

### 2. Compatibility adapter

CommunityMomentsMigration.ts exposes stable route constants and a canonical route helper so future terminology changes remain localized.

### 3. Contract coverage

The V14 contract now verifies canonical primary navigation, legacy Stories/Circles aliases, canonical route helper presence, migration adapter presence, Stories wrapper delegation to Moments, and the existing Story API/media contract.

## Spark product model

The UI should progressively expose Sparks as a first-class presentation model while retaining the existing Story persistence adapter.

Recommended state machine:

draft → publishing → published → archived

Visibility should be explicit:

- public;
- Spiral members;
- followers/approved audience;
- private/draft.

Every Spark should have stable identity, author, creation time, media metadata, visibility, reactions, replies, share/deep-link metadata, and moderation state.

## Moments experience

Moments is the destination for short-form community expression.

Expected behavior:

- immersive viewer;
- swipe/tap navigation;
- keyboard navigation where applicable;
- reduced-motion support;
- authenticated media;
- deep-link opening;
- author progression;
- reactions/replies/share;
- loading/empty/error states;
- mobile safe-area behavior;
- analytics events.

The existing viewer/media infrastructure should be evolved rather than replaced.

## Spirals experience

Spirals are persistent community/group contexts.

Recommended capabilities:

- membership and approval state;
- roles;
- moderation;
- pinned context;
- member discovery;
- Spiral-level media/content;
- notifications;
- searchable context;
- privacy and visibility controls.

A Spiral is a gathering context, not another name for a Spark.

## Stories and Legacy

Stories should remain the durable narrative layer.

A future promotion flow can allow a member to move a Spark into a Story when it has lasting narrative value.

Legacy should be the preservation layer for selected family, cultural, and community memory.

Promotion must be explicit and consent-based.

## Nia AI boundary

Nia AI should remain independently deployable.

Community components should consume stable contracts rather than importing Nia service internals.

Potential future integrations:

- discovery assistance;
- community summarization;
- accessibility assistance;
- cultural context;
- preservation assistance.

AI output must never silently mutate durable community memory or publish content.

## Data and API guardrails

- Preserve existing Story records during the vocabulary migration.
- Preserve authenticated media authorization.
- Keep authorization at the API boundary.
- Validate numeric IDs before requests.
- Preserve deep-link query parameters.
- Prefer contract-first API changes.
- Add migrations before changing persistent schemas.
- Keep analytics names centralized.
- Add feature flags before risky rollout changes.

## Acceptance criteria

The architecture is healthy when:

- Home, Moments, Spirals, People, Notifications are consistently represented as the primary Community navigation.
- Messages is directly reachable from the header.
- Stories/Circles legacy URLs continue to resolve.
- Deep-link query parameters survive normalization.
- Sparks are the short-form presentation language.
- Stories remain durable narratives.
- Legacy remains the preservation layer.
- Authenticated media still works.
- Existing Story persistence remains intact.
- Nia AI remains separated.
- CI validates both canonical architecture and compatibility behavior.

## Recommended next implementation sequence

### Phase 1 — Stabilize

Run typecheck, lint, unit/contract tests, build, deployment verification, and release validation. Add browser-level route tests for legacy redirects and Spark deep links.

### Phase 2 — Productize Sparks

Introduce a typed UI-level Spark model and explicit draft/publish/visibility state while retaining the Story adapter.

### Phase 3 — Strengthen Spirals

Implement membership, roles, moderation, pinned context, and discovery.

### Phase 4 — Connect Stories and Legacy

Add explicit Spark → Story and Story → Legacy preservation flows with consent and privacy controls.

### Phase 5 — Expand Nia AI

Expose AI capabilities only through stable service contracts and feature flags.

## Engineering principle

**Do not rebuild mature infrastructure simply because product vocabulary changed.**

Evolve the experience layer, centralize vocabulary, preserve durable API/media boundaries, and migrate data only when product and operational evidence justify it.
