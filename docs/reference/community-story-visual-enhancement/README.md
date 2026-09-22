# Niakofa Community — Story Visual Enhancement Package
## 2026-09-21

This package is a **visual/UI enhancement layer** for the current Niakofa Community Stories implementation.

It is intentionally designed around the existing production architecture:

Community → Story → media/elements → durable interactions → Messages

### What was used as the visual reference

The supplied Meta Story screenshots were used as interaction references for:

1. Horizontal Story rail / circular identity treatment
2. Gallery + multi-select media selection
3. Full-screen Story editor
4. Bottom editing tool rail
5. Dark music-selection surface
6. Permission/loading states

The package does **not** copy Meta branding, labels, logos, or product identity. The visual language is adapted for Niakofa Community.

### Current repo compatibility

The current repo already provides the important Story behavior:

- `/api/community/stories`
- authenticated Story media retrieval
- photo/video playback
- persisted Story elements
- text/sticker/mention/music metadata/effect elements
- views/reactions/shares
- Story → Direct Message context
- Story media validation
- safe object URL lifecycle
- Story cleanup

This package therefore concentrates on **visual hierarchy, spacing, touch targets, viewer chrome, composer presentation, and gallery/editor affordances**.

### Integration

The primary presentational component is:

`src/components/community/CommunityStoryVisual.tsx`

It is dependency-light and uses the existing `lucide-react` package.

The integration guide explains how to connect the visual shell to the existing state/actions in:

`CommunityStoryRail.tsx`

No database migration is required by this visual package.
No new Story API is required.
No `message_stories` subsystem is introduced.
No media-platform flag is changed.
