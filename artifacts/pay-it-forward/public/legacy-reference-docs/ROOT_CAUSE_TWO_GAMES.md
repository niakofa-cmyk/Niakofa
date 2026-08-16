# Root Cause: Two Completely Different "Games"

> Source: Agent investigation, Aug 2026. This is the authoritative diagnosis of the
> architectural split between the real RPG engine and the visual-novel play flow.

## The Problem

There are two completely different "games" in this codebase, and players never reach the real one.

### The Real RPG Engine
`artifacts/pay-it-forward/src/components/legacy-living-world.tsx` (1,023 lines) is a genuine
grid-based world: walkable tiles, collision (`isLegacyWorldPositionWalkable`), directional
movement, NPC spawns, regions, a character sprite (`legacy-character-sprite.tsx` /
`KwameHeroSprite.tsx`), fishing encounters, village atmosphere.

This is the actual "living world" the design docs describe.

**But it is only ever imported in one place: `pages/legacy-demo.tsx`** — the standalone,
unauthenticated public demo at `/legacy/demo`.

### What Real Players Hit When They Press Play

```
Hub (/legacy) → navigate("/legacy/play")
  ↓
pages/legacy-play.tsx — pure router, resolves active chapter, redirects to /legacy/chapter/:id
  ↓
pages/legacy-chapter.tsx (1,434 lines) — scene-card reader
```

`legacy-chapter.tsx` had `LegacyChapterWorld` (walkable grid, per-family scenes), but when
a player enters a scene tile it called `setWorldViewOpen(false)` and replaced the world with
a fullscreen scene card. The world was hidden, not overlaid.

**Fix applied (Aug 2026):** Scene content is now a slide-up bottom panel that overlays the
always-running `LegacyChapterWorld`. The world never stops.

## The Correct Pattern (from legacy-demo.tsx)

`legacy-demo.tsx` does this right: journal, satchel, and world map are all `useState` booleans
rendered as **fixed overlays on top of the running world**, never a route change.

```tsx
// CORRECT — overlay pattern
const [journalOpen, setJournalOpen] = useState(false);
const [satchelOpen, setSatchelOpen] = useState(false);
const [worldMapOpen, setWorldMapOpen] = useState(false);

// World is always mounted and running
<LegacyLivingWorld ... />

// Overlays sit on top (fixed, z-30/z-50)
{journalOpen && <LegacyDemoJournal ... />}
{worldMapOpen && <LegacyWorldMap ... />}
```

## Routes That Should Be In-World Overlays (Not Separate Pages)

Before the fix, `legacy-home.tsx` navigated to 11 separate destinations:

| Route | Should Be |
|---|---|
| `/legacy/journal` | In-world overlay ✓ (fixed in chapter page) |
| `/legacy/map` | In-world overlay ✓ (fixed in chapter page) |
| `/legacy/challenges` | In-world overlay (future) |
| `/legacy/achievements` | In-world overlay (future) |
| `/legacy/ai-director` | In-world overlay (future) |
| `/legacy/mysteries` | In-world overlay (future) |
| `/legacy/characters` | In-world overlay (future) |
| `/legacy/world-evolution` | In-world overlay (future) |
| `/legacy/seasonal-events` | In-world overlay (future) |

## Stale Duplicate Source Tree

`niakofa-repo/artifacts/pay-it-forward/` is a second, drifted copy of the same app.
`legacy-chapter.tsx` differs between the two, and `legacy-living-world.tsx` doesn't even
exist in the `niakofa-repo/` copy. **Never edit `niakofa-repo/artifacts/`.**

Canonical source: `artifacts/pay-it-forward/` only.

## What LegacyLivingWorld Needs To Be Wired Into the Play Flow

The long-term vision: `legacy-play.tsx` should launch `LegacyLivingWorld` (the full demo world)
as the persistent game backdrop, with chapter scenes appearing as in-world events rather than
fullscreen card replacements. `LegacyChapterWorld` (per-family, data-driven) is the right
engine for the chapter play loop; `LegacyLivingWorld` (fixed House-of-Mensah world) is the
right engine for the public demo and eventually for a proper "sandbox" mode.

They are complementary, not duplicates — keep both.
