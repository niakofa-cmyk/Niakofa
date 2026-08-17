# Niakofa Legacy — Master Reference Document

**Last updated:** August 2026  
**Canonical source:** `artifacts/pay-it-forward/src/` and `artifacts/pay-it-forward/public/`  
**GitHub:** `github.com/niakofa-cmyk/Niakofa` · branch `main`

---

## Architecture Overview

Niakofa Legacy is a living-world RPG chapter system built inside a React/Vite monorepo. The game has **two visual modes** and **one persistent world state**:

| Mode | Component | Purpose |
|---|---|---|
| Semi-top-down exploration | `LegacyChapterWorld` | Walk to chapter scene landmarks, interact with places |
| Side-view combat | `LegacyBattleScene` | Real-time fighting with gravity/jump/combo/skill |
| PixiJS world canvas | `LegacyGameCanvas` | Full PixiJS walking world with fishing, NPC interaction |

All three are overlays inside `legacy-chapter.tsx` — the running world is never unmounted when switching modes.

---

## Runtime Stack

```
artifacts/pay-it-forward/
  src/
    pages/
      legacy-chapter.tsx          ← Master orchestrator; mounts all overlays
      legacy-home.tsx             ← Hub (3 CTAs, decluttered as of Aug 2026)
      legacy-demo.tsx             ← Demo world (Living Baobab + world map pins)
    components/
      legacy-chapter-world.tsx    ← PixiJS top-down exploration grid
      legacy-battle-scene.tsx     ← PixiJS side-view combat arena (Path A)
      legacy-journal-panel.tsx    ← Journal slide-over (in-chapter, no nav)
      legacy-quests-panel.tsx     ← Quests + character sheet slide-over
      legacy-weather-overlay.tsx  ← 8 weather types driven by era/season
      legacy-world-map-pins.tsx   ← Macro overworld map with SVG bezier routes
      legacy-scene-renderer.tsx   ← React layer-stack scene renderer (5 layer types)
      legacy-core-loop.tsx        ← World-change animation (Memory→AI→World)
    legacy-runtime/              ← Self-contained PixiJS game runtime package
      LegacyGameCanvas.tsx        ← React host: PixiJS app, 60fps ticker, input
      legacy-animation-fsm.ts     ← LegacyActorController (movement, animation)
      legacy-combat-fsm.ts        ← LegacyCombatController (dash/jump/combo/skill)
      legacy-hand-drawn-assets.ts ← Art-tier enforcement gate (handDrawn vs placeholder)
      legacy-map-engine.ts        ← LegacyMapScene types, TILE_SIZE_PX=64
      legacy-asset-loader.ts      ← Loads PNG frames into PixiJS Textures
      legacy-scene-renderer.ts    ← PixiJS layer-stack renderer (6 layers, depth-sort)
      legacy-actor-sprite.ts      ← Bridges FSM → AnimatedSprite (feet-anchored)
      kwame-manifest.ts           ← Kwame's real 136-PNG manifest (6 directions)
      scene-cape-coast-compound.ts← First real LegacyMapScene (Cape Coast 1890)
      direction.ts                ← Direction6 type + directionFromVector + clipIdFor
      kwame-locomotion.json       ← Kwame animation clip spec from sprite-extractor
      legacy-world/               ← One-World system sub-package
        types.ts                  ← WorldLocation / WorldActivity / WorldMutation
        locations.ts              ← WORLD_LOCATIONS registry (compound, market, river, etc.)
        activities.ts             ← WORLD_ACTIVITIES (fishing, What Remains, Elder, Chapter 1)
        fishing-runtime.ts        ← In-world fishing FSM (idle→cast→wait→bite→reel→catch)
        mutations.ts              ← applyWorldMutations() + MinimalWorldState
        geometry.ts               ← getLocationsAt() / getPrimaryLocationAt() by tile position
        runtime-interaction.ts    ← evaluateInteraction() per frame + usePlayerLocation hook
    lib/
      legacy-character-engine.ts  ← LegacyCharacterDNA, walking appearance resolver
      legacy-map-engine.ts        ← LegacyMapScene types (lib layer — separate from runtime)
      legacy-map-scenes.ts        ← getMapScene() + 3 authored Cape Coast scenes
      legacy-environment-assets.ts← Typed registry for 357+ env PNGs
      legacy-quest-system.ts      ← Mystery quest creation + vault storage
      legacy-dynamic-world-layout.ts← Chapter layout from scenes/places
    packages/
      legacy-engine/              ← Standalone engine-2 (for promotion to workspace pkg)
        src/core/                 ← GameLoop, WorldState, EventBus, TimeManager
        src/animation/            ← SpriteAtlas, AnimationController, direction.ts
        src/combat/               ← CombatController, HitboxSystem, DamageSystem
        src/actors/               ← Actor, PlayerController, EnemyController, ActorState
        src/world/                ← WeatherManager, world types
        src/LivingWorld.ts        ← Composition root (all systems in one)
  public/
    legacy-character-assets/hand-drawn/
      kwame/                      ← 136 real Kwame PNGs (20 animation dirs, 6 directions)
        kwame_idle_{down,left,right,up,up_left,up_right}/  8 frames each
        kwame_walk_{down,left,right,up,up_left,up_right}/  8 frames each
        kwame_hurt_{down,left,right,up}/                   6 frames each
        kwame_talk_{down,left,right,up}/                   4 frames each
      environment/
        buildings-structures/     ← 177 PNGs (church, colonial-admin, compound,
                                      hut, mission-school, trading-house, fence,
                                      gate, wall, prop-chest, prop-market-stall,
                                      prop-well)
        ground-tiles/             ← 48 PNGs (cobble×8, dirt×8, grass×8, path×8,
                                      sand×8, water-edge×8)
    environment-assets/           ← Legacy 180-PNG set (pre-env-assets zip)
    legacy-reference-docs/        ← All reference docs (this file + arch docs)
```

---

## Character: Kwame Mensah

| Property | Value |
|---|---|
| Canonical ID | `kwame-mensah` |
| Sprite base URL | `/legacy-character-assets/hand-drawn/kwame/` |
| Directions | down, left, right, up, up_left, up_right (6 total) |
| Down-diagonal fallback | down-right→right, down-left→left (handled by `direction.ts`) |
| Hurt/talk diagonal fallback | up_left/up_right→up (no diagonal hurt/talk art) |
| Idle frames | 8 per direction |
| Walk frames | 8 per direction |
| Hurt frames | 6 per direction (4 directions) |
| Talk frames | 4 per direction (4 directions) |
| Combat frames | NOT YET — attack/dash/jump/guard unregistered pending art |

### Frame file naming convention
```
/{baseUrl}/{clipDir}/{clipDir}_{n}.png
e.g. /legacy-character-assets/hand-drawn/kwame/kwame_idle_down/kwame_idle_down_1.png
```

---

## World Locations (One-World System)

All world locations live in `legacy-world/locations.ts` as `WorldLocation` records:

| ID | Name | Type | Tags |
|---|---|---|---|
| `mensah-compound` | Mensah Family Compound | building | story, compound |
| `trading-post` | Trading Post | building | commerce, npc |
| `river-north-bank` | River North Bank | activity-spot | fishing, river, memory |
| `old-jetty` | Old Jetty | activity-spot | fishing, river, memory |
| `what-remains-ruins` | What Remains | memory-site | memory, story, what-remains |
| `elder-home` | Elder's Dwelling | building | village, relationship, npc |

---

## World Activities (One-World System)

Activities bound to locations via `legacy-world/activities.ts`:

| ID | Location | Type | Runtime | Repeatable |
|---|---|---|---|---|
| `fishing-river-north` | river-north-bank | fishing | focused | yes |
| `fishing-old-jetty` | old-jetty | fishing | focused | yes |
| `examine-what-remains` | what-remains-ruins | memory-echo | inline | yes |
| `talk-elder` | elder-home | dialogue | inline | yes |
| `chapter1-enter-compound` | mensah-compound | quest-objective | inline | no |

`runtime: "focused"` = camera/controls narrow (e.g. fishing minigame). The PixiJS world **never unmounts** — it stays running underneath.

---

## Fishing Minigame

Implemented in `legacy-world/fishing-runtime.ts`. Fish species from Galv's MV Fishing Mini Game parameter shapes, reimplemented as native TypeScript — no RPG Maker code anywhere.

**River fish table:** Tilapia (common), Clarias Catfish (uncommon), Volta Barb (common), Jewel Cichlid (uncommon), Nile Tilapia (common), Nile Perch (rare).

**States:** idle → casting → waiting → bite → reeling → catch/fail  
**Controls (while fishing):** Space/J = hook/land · Escape = cancel  
**River Memory:** 10% chance per catch triggers a memory echo (ancestry moment surfaced through fishing)

---

## Combat System (Path A — Real-Time Side-View)

Component: `src/components/legacy-battle-scene.tsx`

| Feature | Spec |
|---|---|
| Physics | Real gravity (0.6/frame), jump velocity (-11), ground at Y=260 |
| Ground combo | 3-hit: reach 34/36/42px · damage 8/9/14 · knockback 4/5/12 |
| Aerial combo | 2-hit: reach 30/34px · damage 7/11 · launch -3/-6 |
| Dash | 12-frame i-frames · speed 8.5 · 30-frame cooldown |
| Legacy Burst | Meter builds 18pts/hit · 100pt max · AoE on full |
| Enemy AI | idle → approach → telegraph (red flash) → attack → recover |
| Hit detection | Frame-timed AABB overlap vs active hitbox/hurtbox rectangles |
| Art status | Colored PIXI.Graphics rectangles — SV sprite slot reserved in character engine |

**Trigger:** Walk onto the Training Ground landmark (⚔️) generated client-side at a deterministic collision-free position near spawn.

**Input leak fix:** `LegacyChapterWorld` receives `inputEnabled={false}` while any full-screen overlay (battle, journal, map, quests, world canvas) is open.

---

## Core Engine (packages/legacy-engine — Engine-2)

A standalone, framework-agnostic game engine built for Niakofa Legacy.

| Module | What it owns |
|---|---|
| `GameLoop` | Fixed-step accumulator (1/60s), max 5 steps/frame to prevent spiral |
| `WorldState` | Persistent world document — all mutations typed, every change emits event + bumps worldVersion |
| `EventBus<WorldEvents>` | Typed, subscribe/emit event bus; decouples every system |
| `TimeManager` | Real-to-game time (configurable minutes/real-second), day/phase transitions |
| `WeatherManager` | Season + phase-driven weather, transitions on time events |
| `AnimationController` | Frame-accurate clip player — hitbox active only during declared hitFrames |
| `SpriteAtlas` | Clip registry; no rendering code — PixiJS reads clipId+frame externally |
| `Actor` | Runtime object for all combatants — position/velocity/health/facing/animation; no render state |
| `PlayerController` | Input → movement → CombatController pipeline |
| `EnemyController` | idle/approach/telegraph/attack/recover AI loop |
| `HitboxSystem` | AABB hit detection between attacker's active hitbox and all living actors' hurtboxes |
| `DamageSystem` | Applies hit events to targets; emits `combat:hit` and `combat:actorDefeated` |
| `CombatController` | Manages all actors in a combat space; tick = animate → hitboxes → knockback |
| `LivingWorld` | Composition root; one instance per session; drive via `world.tick(dtSeconds)` |

**Direction6 system:** `direction.ts` provides `directionFromVector(dx, dy)` → `Direction6` and `clipIdFor(state, direction)` to handle the two missing down-diagonal art directions gracefully.

---

## Scene Data

### Cape Coast Compound (1890) — first real playable scene

```
ID:           cape-coast-compound
Label:        Mensah Family Compound  
Tiles:        14 × 10 (64px each = 896 × 640px world)
Variant:      1912-prosperous
Lighting:     afternoon
Interaction:  compound-door → dialogue:kwame-enters-compound
              well → vaultArtifact:family-well-memory
NPC:          ama-serwaa (namedNPC) at (8,5) facing down
Collision:    compound footprint (6,3,4×3), well (3,4,1×1)
Layers:       ground-grass-01, ground-path-02, building-compound-01,
              structure-fence-01, prop-well-01
```

---

## Environment Asset Categories

| Category | Count | Example |
|---|---|---|
| building-church | 11 | Mission church, colonial era |
| building-colonial-admin | 11 | Administrative building |
| building-compound | 11 | Family compound |
| building-hut | 11 | Traditional hut |
| building-mission-school | 11 | Mission school |
| building-trading-house | 11 (partial) | Trading post/house |
| structure-fence | varies | Perimeter fence |
| structure-gate | varies | Compound gate |
| structure-wall | varies | Wall segments |
| prop-chest | varies | Storage/chest |
| prop-market-stall | varies | Market stall |
| prop-well | 7 | Water well |
| ground-cobble | 8 | Cobblestone path |
| ground-dirt | 8 | Dirt ground |
| ground-grass | 8 | Grass tiles |
| ground-path | 8 | Dirt path |
| ground-sand | 8 | Sand/beach |
| water-edge | 8 | Water/river edge |

Total: 357+ PNGs in the combined set.

---

## Outstanding Gaps (Combat Art → Next Upload)

The following animation states exist in the engine but have no hand-drawn frames yet. Once art ships, register them in `kwame-manifest.ts`:

```
lightAttack1 (12 frames) · heavyAttack (14 frames) · dash (6 frames)
aerialAttack (8 frames)  · jump (6 frames)          · guard (4 frames)
```

The `LegacyActorSprite` will fall back to the idle clip and log a warning message (`[legacy-actor-sprite] No frames for ...`) until these are registered.

---

## Key Rules

1. **Never unmount the world.** All overlays (Journal, Map, Quests, Battle, Live World Canvas) open over the running PixiJS world. The world keeps ticking underneath.
2. **`inputEnabled={false}` on any overlay.** When any full-screen overlay is open, `LegacyChapterWorld` gets `inputEnabled={false}` to prevent arrow keys moving the hidden explorer character simultaneously.
3. **Art-tier enforcement.** `legacy-hand-drawn-assets.ts` enforces `handDrawn` vs `prototypePixel` tier. Never render `prototypePixel` art if a `handDrawn` alternative exists for the same subject.
4. **No RPG Maker code.** Galv's fishing plugin, LMBS combat system, and RPG Maker character generator are mechanics references only. All runtime code is native TypeScript/PixiJS.
5. **Never invent family history.** The Training Ground trigger is a dedicated practice spot generated client-side, deliberately not tied to any family scene data. Combat encounters don't appear inside real family history moments.
6. **World grows, never regenerates.** `WorldState.mergeContentSeed()` only ever adds NPCs/landmarks/quests — never deletes or overwrites existing world content.
7. **Canonical source is `artifacts/pay-it-forward/`.** `niakofa-repo/` was deleted (1,349 stale tracked files) in Aug 2026. Never edit from a mirror.

---

## Appendix: Eldiron + MMOCore + Material Maker Analysis (August 2026)

### Three Uploaded Reference Tools

| Tool | License | Role in Niakofa |
|---|---|---|
| Eldiron (ZIP, 1,673 files, ~130MB) | MIT | Architecture reference — entity, collision, region, NPC schedule, procedural tilegraph |
| MMOCore (ZIP, Java/Bukkit) | COMMERCIAL — do NOT copy code | Design reference — attribute system, event-driven XP, fishing, quests |
| Material Maker 1.7 (DMG) | MIT | Art pipeline tool — procedural ground/wall/surface materials → PNG export |

### Systems Delivered from This Analysis

| Layer | Gap Before | Delivered |
|---|---|---|
| Layer 6 — NPC AI | World felt dead | 4 schedule-driven NPCs (Ama Serwaa, Kofi Asante, Nana Akua, Abena Manu) with dawn/morning/afternoon/evening/night behavior, pathfinding, relationship levels, dialogue gating |
| Layer 10 — Legacy Engine | No progression | 6-attribute system (strength/endurance/wisdom/legacy/kinship/river_lore), event-driven XP from every world action, level-up callbacks, combat/fishing modifiers |

### 10-Layer Status After This Session

| Layer | Status |
|---|---|
| L1 Renderer | ✅ PixiJS WebGL, 6-layer stack |
| L2 World | ✅ Continuous Cape Coast map |
| L3 Character | ✅ Kwame 6-direction movement |
| L4 Animation | ✅ idle/walk/hurt/talk (136 PNGs) |
| L5 Collision | ✅ Wall-sliding AABB (FSM lines 98-99) |
| L6 NPC AI | ✅ 4 NPCs with schedules, dialogue, relationships |
| L7 Combat | ✅ Real-time side-view LegacyBattleScene |
| L8 Quest runtime | ✅ World-embedded via WorldActivity + NPC dialogue triggers |
| L9 Living systems | ✅ Fishing FSM, weather, time-of-day, relationships |
| L10 Legacy engine | ✅ KwameAttributeSystem — 6 attrs, typed events, persistence |

### Remaining Art Gaps
- Combat animation frames (attack/dash/jump/guard) — no art yet; engine registered
- NPC sprite sheets — using colored PIXI.Graphics placeholders until art ships
- Additional scene tiles beyond Cape Coast Compound (river bank, market, ruins)
