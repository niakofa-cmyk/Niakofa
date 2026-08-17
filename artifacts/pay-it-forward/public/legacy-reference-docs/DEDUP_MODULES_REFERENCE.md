# Niakofa Legacy — Dedup Modules Reference

**Source:** `niakofa-dedup-modules_1786980266688.zip` (applied Aug 2026)  
**Original patch base:** commit `13d9e0b` — merged forward to current HEAD

---

## What Was Duplicated

Four modules existed in both `src/lib/*.ts` AND `src/legacy-runtime/*.ts` with the
same filenames but diverged implementations. The `legacy-runtime/` copies were stale;
`LegacyGameCanvas.tsx` was importing them instead of the canonical `lib/` versions.

| Module | lib/ version | legacy-runtime/ (deleted) | Winner |
|---|---|---|---|
| `legacy-animation-fsm.ts` | Bug fix: `actionPlaying` flag stops movement overwriting mid-attack animation | 6-direction `LegacyFacing` type (`up_left`/`up_right`) matching Kwame atlas | **Merged both** |
| `legacy-combat-fsm.ts` | More complete: `getAnimSpec`, guard-state cleanup on interrupt, removed `as unknown` cast | Incomplete | **lib/** |
| `legacy-map-engine.ts` | Near-identical | Near-identical | **lib/** |
| `legacy-hand-drawn-assets.ts` | Near-identical | Near-identical | **lib/** |

---

## Files Changed (this pass)

### Deleted from `legacy-runtime/` (stale duplicates)
- `legacy-animation-fsm.ts`
- `legacy-combat-fsm.ts`
- `legacy-map-engine.ts`
- `legacy-hand-drawn-assets.ts`

### Updated imports → `@/lib/`
- `legacy-runtime/LegacyGameCanvas.tsx` — `@/lib/legacy-animation-fsm`, `@/lib/legacy-combat-fsm`, `@/lib/legacy-map-engine`
- `legacy-runtime/legacy-actor-sprite.ts` — same
- `legacy-runtime/legacy-asset-loader.ts` — same
- `legacy-runtime/legacy-scene-renderer.ts` — `@/lib/legacy-map-engine`
- `legacy-runtime/scene-cape-coast-compound.ts` — `@/lib/legacy-map-engine`

### Bug fixes applied in the same pass

| Bug | File | Fix |
|---|---|---|
| `LegacyFacing` missing `up_left`/`up_right` | `lib/legacy-animation-fsm.ts` | Added 6-direction type to match Kwame atlas |
| `structure` layer missing from `LAYER_KIND_ORDER` | `legacy-scene-renderer.ts` | Added `"structure"` between `"building"` and `"prop"` — prevented crash on any scene using fence/gate/wall layers |
| `TILE_PX` hardcoded constant (64) | `LegacyGameCanvas.tsx` | Replaced with `TILE_SIZE_PX` imported from `@/lib/legacy-map-engine` |
| Space key scrolling page | `LegacyGameCanvas.tsx` | Added `e.preventDefault()` for Space + Arrow keys in `onKeyDown` |
| NPC collision one-frame stale | `LegacyGameCanvas.tsx` | Moved NPC tick to run BEFORE player movement; collision query now uses current-frame NPC positions |
| Player could walk off world edge | `LegacyGameCanvas.tsx` | Added world-boundary clamp to player position each tick |
| `LegacyGameCanvas` opt-in only | `pages/legacy-chapter.tsx` | Changed `useState(false)` → `useState(true)` — Living World is now the default entry point |

---

## Architecture Rule (post-dedup)

**Single source of truth for all shared types:**

```
src/lib/legacy-animation-fsm.ts    ← LegacyActorController, LegacyFacing, LegacyAnimState, ANIM_SPEC
src/lib/legacy-combat-fsm.ts       ← LegacyCombatController, LegacyFullAnimState, COMBAT_ANIM_SPEC
src/lib/legacy-map-engine.ts       ← LegacyMapScene, TILE_SIZE_PX, LegacyMapLayerKind
src/lib/legacy-hand-drawn-assets.ts ← LegacyArtTier, enforceArtTierPolicy
```

`legacy-runtime/` files import these via `@/lib/` alias.  
Never add `legacy-animation-fsm.ts`, `legacy-combat-fsm.ts`, `legacy-map-engine.ts`,
or `legacy-hand-drawn-assets.ts` back to `legacy-runtime/` — that re-creates the split.

---

## ZIP File Contents (for reference)

```
niakofa-dedup-modules/
├── README.md
├── niakofa-dedup-modules.patch
└── files/
    └── artifacts/pay-it-forward/src/
        ├── lib/
        │   └── legacy-animation-fsm.ts   ← merged 4+6 direction version
        └── legacy-runtime/
            ├── LegacyGameCanvas.tsx      ← repointed to @/lib imports
            ├── legacy-scene-renderer.ts
            ├── legacy-actor-sprite.ts
            ├── legacy-asset-loader.ts
            └── scene-cape-coast-compound.ts
```
