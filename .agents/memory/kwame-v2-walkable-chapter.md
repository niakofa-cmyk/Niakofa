---
name: Kwame Atlas v2 + Walkable Chapter
description: Atlas v2 naming/structure, duplicate-key rule, App.tsx route adapter pattern, DB migration 0106, DarkNinja reference boundary.
---

## Kwame Atlas v2 — Key Facts

- Total atlas dirs: 13 hand-drawn + 1 RPG Maker MV prototype (in `public/legacy-character-assets/kwame-mensah/atlas/`)
- New in v2: `DOWN_LEFT/` — fills `idle-down`, `walk-down`, `idle-left`, `walk-left` (was entirely absent in v1)
- v2 frame naming: `<dir>_rN_cM.png` (row N, column M). v1 frames kept their original `-N.png` names alongside.
- All 11 existing dirs re-extracted with 32 v2 frames (`_rN_cM`), merged into existing dirs (both v1 and v2 coexist).
- `RPG_MAKER_MV_PROTOTYPE/` — 70 frames, artTier `prototypePixel`. Enforcement gate prevents use for Kwame (protagonist requires `handDrawn`). Use for background NPCs or combat pipeline reference only.

**Why:** Fixed-geometry extraction finally worked for all 12 hand-drawn atlases; previous per-file detection failed on some atlases.

**Duplicate key rule:** `KWAME_ATLAS_FRAMES` is a TypeScript object literal — TypeScript TS1117 fires if the same clip name appears twice. When upgrading a clip source, remove the old entry; don't add alongside it.

## App.tsx Route Adapter Pattern

When a lazy-loaded page has an optional custom prop (e.g. `onClose?`) that conflicts with wouter's `RouteComponentProps`, wrap in an arrow component:

```tsx
// BAD — TS2322 if LegacyMapPage has LegacyMapPageProps (not RouteComponentProps)
<Route path="/legacy/map" component={LegacyMapPage} />

// GOOD
<Route path="/legacy/map" component={() => <LegacyMapPage />} />
```

**Why:** Wouter injects route params as props; optional page props don't satisfy `RouteComponentProps` shape.

## DB Migration 0106

- File: `lib/db/migrations/0106_legacy_member_gender_for_appearance.sql`
- Adds `gender TEXT` column to `family_members`, constrained to `'male' | 'female' | NULL`.
- Idempotent (`IF NOT EXISTS`). Applied to dev DB as of Aug 2026.
- Must also be applied to prod DB before deploying the appearance patch.

## DarkNinja Reference Boundary

- 101 frames in `public/legacy-reference-docs/animation-reference/darkninja/`
- artTier: `prototypePixel` — never use as Kwame or any hand-drawn character
- Purpose: combat animation structure model (frame counts, arc shapes) for Kwame's 36 pending combat clips
- Reference doc: `DARKNINJA_ANIMATION_REFERENCE.md` in same folder

## Walkable Chapter Architecture

- `legacy-dynamic-world-layout.ts` — deterministic serpentine grid generator; seeded mulberry32 PRNG; same chapterId+scenes always produces same layout
- `legacy-chapter-world.tsx` — renders the grid, handles movement, fires `onEnterScene(sceneNumber)` on landmark arrival; uses `LegacyCharacterSprite`
- `legacy-journal-panel.tsx` — journal UI as embedded slide-over OR standalone route body
- `legacy-chapter.tsx` — `worldViewOpen` defaults true; Journal/Map open as overlays
- `legacy-chapters.ts` (API) — scenes endpoint now returns `ancestorAppearance` (via `resolveFamilyMemberAppearance`)
- `family.ts` (API) — PATCH now accepts `gender`/`birth_year`/`death_year`
- `diaspora.ts` (API) — GET tree now selects `birth_year`/`death_year`/`gender`
- `family-tree.tsx` — curator/owner edit panel for gender/birth/death year

**How to apply:** All these are already applied (commit `63930129`). The only remaining step is running migration 0106 against prod DB before deploying.
