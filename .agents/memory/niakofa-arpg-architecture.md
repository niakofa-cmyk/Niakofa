---
name: Niakofa ARPG Architecture
description: PixiJS runtime location, OneWorld system, combat patch, engine-2 package, direction system, sprite asset paths.
---

## Runtime location
`artifacts/pay-it-forward/src/legacy-runtime/` — 13 files + `legacy-world/` sub-package (7 files).

## Files in the runtime package
| File | Role |
|---|---|
| `LegacyGameCanvas.tsx` | React host; boots PixiJS, 60fps ticker, keyboard input; fishing state machine; evaluateInteraction() called per frame; prompt UI overlay |
| `legacy-animation-fsm.ts` | LegacyActorController — LegacyFacing now includes up_left/up_right |
| `legacy-combat-fsm.ts` | LegacyCombatController — dash/jump/parry/guard/combo window |
| `legacy-hand-drawn-assets.ts` | Art-tier enforcement; imports from `@/lib/legacy-character-engine` |
| `legacy-map-engine.ts` | LegacyMapScene types, TILE_SIZE_PX=64 |
| `legacy-asset-loader.ts` | PNG frames → PixiJS Textures; frame key = `${animState}:${facing}` |
| `legacy-scene-renderer.ts` | Full 5-layer renderer + depthSortActors() |
| `legacy-actor-sprite.ts` | Bridges FSM → AnimatedSprite; warns on fallback frames |
| `kwame-manifest.ts` | Real 136-PNG manifest using dir-based paths (kwame_idle_down/kwame_idle_down_1.png) |
| `scene-cape-coast-compound.ts` | First real LegacyMapScene (Cape Coast 1890) |
| `direction.ts` | Direction6, directionFromVector(), clipIdFor() from engine-2 |
| `kwame-locomotion.json` | Kwame animation clip spec from sprite-extractor |

## OneWorld sub-package (legacy-world/)
| File | Role |
|---|---|
| `types.ts` | WorldLocation / WorldActivity / WorldMutation shapes |
| `locations.ts` | WORLD_LOCATIONS registry (compound, trading-post, river, jetty, ruins, elder) |
| `activities.ts` | fishing-river-north/old-jetty, examine-what-remains, talk-elder, chapter1 objective |
| `fishing-runtime.ts` | In-world fishing FSM: idle→casting→waiting→bite→reeling→catch/fail; 6 fish species; River Memory |
| `mutations.ts` | applyWorldMutations() + MinimalWorldState |
| `geometry.ts` | getLocationsAt() / getPrimaryLocationAt() by tile position |
| `runtime-interaction.ts` | evaluateInteraction() per-frame + usePlayerLocation hook |

## Sprite asset paths (PERMANENT RULE)
Kwame PNGs are at: `public/legacy-character-assets/hand-drawn/kwame/{clipDir}/{clipDir}_{n}.png`
Base URL: `/legacy-character-assets/hand-drawn/kwame/`
Dirs: kwame_idle_{down,left,right,up,up_left,up_right}/ — 8 frames each
      kwame_walk_{down,left,right,up,up_left,up_right}/ — 8 frames each
      kwame_hurt_{down,left,right,up}/                  — 6 frames each
      kwame_talk_{down,left,right,up}/                  — 4 frames each

Environment PNGs: `public/legacy-character-assets/hand-drawn/environment/buildings-structures/` and `ground-tiles/`

## Combat system (LegacyBattleScene)
`src/components/legacy-battle-scene.tsx` — side-view arena:
- Real gravity/jump; 3-hit ground combo (8/9/14 dmg); 2-hit aerial combo
- Dash i-frames (12 frames); Legacy Burst skill (meter 18pts/hit, 100 max)
- Enemy AI: approach → telegraph (red flash) → attack → recover
- Triggered by Training Ground landmark (⚔️) in LegacyChapterWorld

## Input-leak fix (PERMANENT RULE)
LegacyChapterWorld receives:
  `inputEnabled={!battleOpen && !journalOpen && !mapOpen && !placeSheetOpen && !questsOpen && !gameCanvasOpen}`
Never remove any of these conditions when adding new overlays.

## Engine-2 standalone package
`artifacts/pay-it-forward/packages/legacy-engine/` — ready for promotion to workspace pkg.
Key files: LivingWorld.ts (composition root), GameLoop (fixed-step), WorldState, EventBus, AnimationController, CombatController, direction.ts.

## Import fix (permanent rule)
`legacy-hand-drawn-assets.ts` imports from `@/lib/legacy-character-engine` NOT from stub.

## Master reference doc
`public/legacy-reference-docs/NIAKOFA_LEGACY_REFERENCE.md` — comprehensive spec covering runtime stack, Kwame spec, world locations, fishing, combat, engine-2, scene data, asset categories, key rules.

## Outstanding combat art gaps
lightAttack1/2, heavyAttack, aerialAttack, dash, jump, guard — all unregistered in kwame-manifest.ts pending art delivery.
