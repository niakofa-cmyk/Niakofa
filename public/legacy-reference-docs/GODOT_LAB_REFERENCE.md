# Godot 4 (macOS stable) — R&D Lab Reference
## Role in Niakofa

**Godot is an experimental/R&D laboratory, NOT the current game runtime.**
The current production game runs on **PixiJS + React** inside `artifacts/pay-it-forward`.
Do NOT migrate to Godot right now.

---

## Why Not Migrate Yet

Niakofa already has working integrations that would require full re-implementation in Godot:

| System | Current Status |
|---|---|
| Family Tree data | Connected via `/api/legacy/...` |
| Family Vault | Connected |
| Memory/Interview recording | WebRTC + MediaRecorder working |
| AI transcription | `/api/nia/voice/transcribe` working |
| Character Evolution | Connected — `deriveLifeStage()` + `inferAppearance()` |
| Authentication | Full session system |
| Legacy progression | `KwameAttributeSystem` fully wired |

Migrating to Godot means re-solving all of these, including:
authentication, data synchronization, character evolution, save states,
memory uploads, audio/video capture, web deployment, game-to-platform communication.

That is unnecessary before finishing the first complete vertical slice.

---

## What Godot Does Well (Future R&D targets)

| Capability | Godot system |
|---|---|
| TileMaps | TileSet + TileMap nodes — much richer than manual tile rendering |
| Advanced collision | Physics 2D — CharacterBody2D, StaticBody2D, Areas |
| NPC navigation | NavigationAgent2D + NavigationRegion2D |
| Combat | AnimationTree + StateMachine for complex multi-state combat |
| Lighting | CanvasModulate + Light2D + Occluder2D |
| Particles | GPUParticles2D |
| Large worlds | Scene streaming / World tiles |

---

## Recommended R&D Workflow

```
NIAKOFA MAIN APP (production)
        │
        └── React + LegacyChapterWorld + PixiJS
                │
                ▼
        PRODUCTION GAME PATH

SEPARATE

NIAKOFA GODOT LAB
        │
        ├── Test character movement (CharacterBody2D)
        ├── Test collision + navigation (NavigationAgent2D)
        ├── Test TileMaps (Cape Coast compound)
        ├── Test NPC A* pathfinding
        ├── Test dynamic 2D lighting
        ├── Test combat state machines (AnimationTree)
        └── Test scene streaming for larger worlds
```

---

## Godot → PixiJS Pattern Mapping

| Godot | Niakofa PixiJS equivalent |
|---|---|
| Main scene `.tscn` | `LegacyGameCanvas.tsx` |
| CharacterBody2D | `LegacyActorController` + `legacy-animation-fsm.ts` |
| NavigationAgent2D | `NPCController.tick()` pathfinding |
| Area2D interaction | `evaluateInteraction()` in `runtime-interaction.ts` |
| TileMap | `legacy-scene-renderer.ts` renderStaticLayers |
| AnimationTree | `legacy-animation-fsm.ts` state machine |
| GDScript | TypeScript |

---

## Archived Version

**Godot 4 macOS x64 stable** — `godot-osx-64-stable.zip` (archived only).
Do not reference as a build system, dependency, or CI tool for the current repo.
Future decision point: evaluate Godot after the first complete vertical slice is done.

---

## Decision Criteria for Future Migration

Migrate when:
1. PixiJS renderer can no longer handle the required world size or NPC count at 60fps
2. Navigation complexity (branching paths, dynamic obstacles) exceeds custom pathfinding capacity
3. Combat FSM requires features (physics, hit-stop, screen-shake) that cost more to build in PixiJS than to adopt Godot
4. Team grows to include Godot-specialized developers

Do NOT migrate for aesthetic reasons or feature envy. Keep the current runtime until these criteria are met.
