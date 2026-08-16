---
name: Niakofa ARPG Architecture
description: PixiJS runtime location, game canvas wiring, combat FSM, and package decoupling decision.
---

## Runtime location
`artifacts/pay-it-forward/src/legacy-runtime/` — 10 files, all passing typecheck.

## Files in the runtime package
| File | Role |
|---|---|
| `LegacyGameCanvas.tsx` | React host: mounts PixiJS app, 60fps ticker, keyboard input (arrows/WASD/Shift/Space/J/K/L) |
| `legacy-animation-fsm.ts` | LegacyActorController — movement, facing, anim state, frame advance |
| `legacy-combat-fsm.ts` | LegacyCombatController — dash/jump/parry/guard/combo window/invuln/stamina |
| `legacy-hand-drawn-assets.ts` | Art-tier enforcement (handDrawn vs prototypePixel); imports from `@/lib/legacy-character-engine` |
| `legacy-map-engine.ts` | LegacyMapScene types, TILE_SIZE_PX=64, LegacyMapLayer/Collision/InteractionPoint/NpcSpawn |
| `legacy-asset-loader.ts` | loadCharacterFrameSet / loadEnvironmentTextures → PixiJS Textures; frame key = `${animState}:${facing}` |
| `legacy-scene-renderer.ts` | buildSceneContainers / renderStaticLayers / depthSortActors — full layer stack |
| `legacy-actor-sprite.ts` | LegacyActorSprite bridges FSM → AnimatedSprite; warns on fallback frames |
| `kwame-manifest.ts` | Kwame's real 384-frame manifest — idle/walk/run/talk/interact/knockback covered; combat unregistered pending art |
| `scene-cape-coast-compound.ts` | First real LegacyMapScene (14×10 tiles, Cape Coast Compound 1890, using v1 PNG filenames) |

## Import fix (permanent rule)
`legacy-hand-drawn-assets.ts` imports from `@/lib/legacy-character-engine` (the real engine), NOT from `./legacy-character-engine` (the deleted stub). This was the one import that needed changing when copying from the zip.

## Integration in legacy-chapter.tsx
- "World" button in action bar opens `gameCanvasOpen` overlay
- `LegacyGameCanvas` receives `capeCoastCompoundScene + capeCoastCompoundAssets + environmentBaseUrl + kwameHandDrawnManifest`
- "Return to Chapter" button closes the overlay; chapter world stays mounted underneath

## Layer stack (RUNTIME_ARCHITECTURE_UPDATE.md)
`sky → background (parallax) → far vegetation → buildings → structures → ground → props → NPCs → player → foreground → lighting → weather → particles → UI`

Currently implemented: ground → decoration → building → prop → actorLayer → foreground

## Package decoupling decision (GAME_PACKAGE_ARCHITECTURE.md)
**Decision:** Keep in monorepo, start in `src/legacy-runtime/`, promote to `packages/legacy-game` once the continuous living slice is stable. React shell talks to game via `createLegacyGameRuntime({ container, initialState, onQuestCompleted, onCombatOutcome, onWorldMutation })`.

**Why:** PixiJS + large tile/animation assets bloat the community app; the monorepo already uses pnpm workspaces; the game grows quickly once combat + NPC AI + map streaming land.

## Known gaps (next art pack needed)
- Combat frames: lightAttack1/2, heavyAttack, aerialAttack, dash, airDash, jump, doubleJump, fall, guard, parry — all registered as placeholder in kwame-manifest.ts with comment
- Partial occlusion (walking behind tree canopy) — needs split-sprite tree (trunk in prop, canopy in foreground)
- NPC AI movement — npcSpawns defined in scene but nothing drives them
- Interaction → dialogue/vault wiring — tryInteract() logs to console; needs host-page wiring
- Parallax sky/background — layer stack supports it but not yet rendered
