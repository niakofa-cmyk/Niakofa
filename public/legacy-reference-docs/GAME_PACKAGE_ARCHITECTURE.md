Yes — create a dedicated game package (or at least a hard game/ boundary) and treat the Legacy RPG as its own product that happens to be deeply integrated with Niakofa’s Family Vault.



Why decoupling is the right call
Problem if you stay inside pay-it-forward	Benefit of a dedicated game package
Game runtime, assets, and tests mix with Mapbox, Stripe, Circles, Nia, payments	Clean dependency graph and faster builds for the game
Harder to reason about “game loop vs app shell”	Matches the three-layer architecture you already wrote in the Canonical Spec
PixiJS + large tile/animation assets bloat the community app	Game can have its own Vite config, asset pipeline, and performance budget
Risk of accidental coupling (React components owning simulation)	Enforces the boundary: React shell talks to game runtime via clear APIs
Future shipping (standalone demo, itch, Steam web, etc.) is painful	Easier to extract or dual-ship later

The monorepo already uses pnpm workspaces and has a packages/ directory, so the infrastructure is ready.
Recommended structure (pragmatic, not radical)
Keep everything in the same monorepo. Do not create a completely separate GitHub repo yet.
Suggested layout:
text

packages/
  legacy-game/                 ← new dedicated package
    package.json               (@niakofa/legacy-game or @workspace/legacy-game)
    src/
      runtime/                 # PixiJS world, movement, camera, combat, weather
      animation/               # controllers, atlas loaders
      combat/                  # FSM, hitboxes, rites
      world/                   # persistent map, layers, entity spawner
      quest/                   # runtime quest tracking + echoes
      bridge/                  # clean API that the React app calls
    public/ or assets/         # tiles, atlases, audio (or keep shared)
    tests/
artifacts/
  pay-it-forward/              # stays the community app + thin shell
    src/
      components/legacy-*/     # mostly thin wrappers / route pages
      # imports from @workspace/legacy-game


Alternative lighter first step (if you want less churn immediately):
text

artifacts/
  pay-it-forward/
    src/
      game/                    # or legacy-game/
        runtime/
        ...


…then promote it to packages/legacy-game once the continuous slice is stable.
I recommend going straight to packages/legacy-game (or packages/niakofa-legacy) because the continuous living world + real combat will grow quickly.
What should stay coupled vs what should be cleanly separated
Keep shared (via well-defined interfaces):
* Family Vault / character DNA / ancestor data
* Auth / family identity
* High-level quest definitions and journal entries
* WorldVersion / regeneration triggers
* Trait / progression outcomes that feed back into the family story
Move fully into the game package:
* PixiJS application and tick loop
* Tilemap, layers, collision, camera
* Animation controllers and atlas loading
* Weather / time-of-day simulation
* Combat FSM, hitboxes, hurtboxes
* NPC movement and local AI inside the continuous map
* Runtime quest objective tracking and world markers
* Persistent in-map player position and local world state
The React app should talk to the game roughly like this:
TypeScript

// thin bridge
const game = createLegacyGameRuntime({
  container,
  initialState: { familyId, worldVersion, activeQuests, weatherSeed, ... },
  onQuestCompleted: (result) => { /* write to Family Vault / journal */ },
  onCombatOutcome: (result) => { /* trait gain, world mark, etc. */ },
  onWorldMutation: (patch) => { /* regeneration */ },
});

game.start();
game.setWeather(...);
game.loadQuest(...);


React never owns the requestAnimationFrame loop or hitboxes.
Migration strategy (low-risk order)
1. Create the new package and move pure runtime code first (movement system, combat FSM, scene renderer, entity spawner, animation helpers, world layout).
2. Move the large asset folders (environment tiles, character atlases, village assets) under the game package or a shared assets package.
3. Keep the existing React pages (legacy-demo, legacy-home, chapter screens, etc.) as thin shells that mount the game runtime.
4. Update tests so game-specific tests live with the game package.
5. Only after the continuous living slice feels solid, decide whether the public demo route stays inside pay-it-forward or gets its own entry point.



Yes — you should decouple it, but do it in stages rather than a big-bang extraction.
Right now the Legacy RPG is deeply embedded inside artifacts/pay-it-forward (the main community/mutual-aid app). That made sense when it was a feature demo. It no longer makes sense once you commit to a Continuous Playable Living Slice with real-time PixiJS runtime, weather, combat rites of passage, persistent world state, and full animation/hitbox work.







Yes — I strongly recommend it.
The Niakofa Legacy RPG should become a standalone game module/folder and be decoupled from pay-it-forward.
But I would not completely disconnect it from Niakofa.
The correct architecture is:
Decouple the runtime. Keep the data and identity connected.
Right now, based on the Pixi patch structure we evaluated, the game appears to be evolving inside something like:


artifacts/pay-it-forward/
└── src/
    ├── components/
    │   └── legacy-chapter-world.tsx
    └── lib/
        ├── legacy-character-engine.ts
        └── legacy-dynamic-world-layout.ts

That may have been acceptable while Legacy Mode was primarily a React experience with screens, cards, maps, and simulated movement.
It becomes increasingly problematic once you add:
* Pixi rendering
* a game loop
* smooth movement
* animation state machines
* camera
* collision
* NPC behavior
* map streaming
* lighting
* weather
* particles
* combat/action
* audio zones
* save state
* world simulation
At that point, pay-it-forward should not be responsible for the actual game runtime.

Recommended architecture
I recommend keeping everything in the same Niakofa repository initially, but separating the applications clearly.


NIAKOFA/
│
├── apps/
│   │
│   ├── niakofa-web/
│   │   │
│   │   ├── Family Tree
│   │   ├── Family Vault
│   │   ├── Recording
│   │   ├── Microphone
│   │   ├── Live Video
│   │   ├── Legacy Dashboard
│   │   ├── Character Management
│   │   └── Game Launcher
│   │
│   └── legacy-rpg/
│       │
│       ├── game/
│       ├── renderer/
│       ├── world/
│       ├── entities/
│       ├── characters/
│       ├── animation/
│       ├── maps/
│       ├── systems/
│       ├── scenes/
│       └── ui/
│
├── packages/
│   │
│   ├── legacy-data/
│   ├── character-engine/
│   ├── world-schema/
│   ├── game-contracts/
│   └── shared-types/
│
└── assets/
    │
    ├── characters/
    ├── environments/
    ├── maps/
    ├── audio/
    └── cinematics/

The exact folder names can change, but the separation should happen now.

The key distinction
pay-it-forward / Niakofa platform
Responsible for:


FAMILY DATA
+
MEMORIES
+
AUDIO RECORDING
+
VIDEO RECORDING
+
TRANSCRIPTS
+
FAMILY TREE
+
FAMILY VAULT
+
CHARACTER CREATION
+
LEGACY PROGRESS
+
ACCOUNT / USER DATA

legacy-rpg
Responsible for:


GAME LOOP
+
RENDERING
+
MOVEMENT
+
COLLISION
+
CAMERA
+
ANIMATION
+
NPCs
+
MAPS
+
QUESTS
+
DIALOGUE
+
INVENTORY
+
WORLD STATE
+
LIGHTING
+
WEATHER
+
AUDIO
+
COMBAT / ACTION

This is the separation I recommend:


                  NIAKOFA PLATFORM
                         │
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
        LEGACY DATA             GAME LAUNCHER
              │                     │
              └──────────┬──────────┘
                         │
                         ▼
                 NIAKOFA LEGACY RPG
                         │
                         ▼
                   GAME RUNTIME


Do not duplicate the Character Engine
This is extremely important.
I would not create:


pay-it-forward/
└── character-engine.ts

legacy-rpg/
└── another-character-engine.ts

That will eventually cause divergence.
Instead:


packages/
└── character-engine/
    │
    ├── character-types.ts
    ├── character-dna.ts
    ├── life-stages.ts
    ├── appearance.ts
    ├── evolution.ts
    └── runtime-adapter.ts

Then:


NIAKOFA WEB
       │
       └──── uses ────┐
                      │
                      ▼
             CHARACTER ENGINE
                      │
                      ▲
                      │
LEGACY RPG ───────────┘

One character system.
Two consumers.
That means Kwame's identity remains consistent whether you see him:
* in the Family Tree
* on a character card
* in Legacy Mode
* in dialogue
* on the World Map
* as a playable RPG character

The same applies to Legacy data
The game should consume Legacy data.
It should not own a separate copy of the family database.
The architecture should look like this:


FAMILY MEMBER
      │
      ▼
NIAKOFA DATABASE
      │
      ▼
LEGACY KNOWLEDGE SYSTEM
      │
      ├── People
      ├── Relationships
      ├── Places
      ├── Events
      ├── Memories
      ├── Artifacts
      └── Timeline
             │
             ▼
       WORLD BUILDER
             │
             ▼
      NIAKOFA RPG WORLD

The RPG receives something like:


type WorldSnapshot = {
  worldId: string
  version: number

  characters: RuntimeCharacter[]
  locations: RuntimeLocation[]
  relationships: Relationship[]
  events: LegacyEvent[]
  artifacts: Artifact[]
  quests: Quest[]
}

The game should not need to know whether that data originally came from:
* a microphone recording
* live video
* a typed memory
* an uploaded photograph
* the Family Tree
That should all happen before the data reaches the runtime.

I would separate the game into its own internal architecture
For example:


legacy-rpg/
│
├── src/
│
│   ├── core/
│   │   ├── Game.ts
│   │   ├── GameLoop.ts
│   │   ├── GameState.ts
│   │   └── EventBus.ts
│   │
│   ├── renderer/
│   │   ├── PixiRenderer.ts
│   │   ├── Camera.ts
│   │   ├── Lighting.ts
│   │   ├── Weather.ts
│   │   └── Layers.ts
│   │
│   ├── entities/
│   │   ├── Entity.ts
│   │   ├── Player.ts
│   │   ├── NPC.ts
│   │   └── EntityManager.ts
│   │
│   ├── characters/
│   │   ├── CharacterFactory.ts
│   │   ├── CharacterRenderer.ts
│   │   ├── CharacterAnimation.ts
│   │   └── CharacterEvolutionAdapter.ts
│   │
│   ├── systems/
│   │   ├── MovementSystem.ts
│   │   ├── CollisionSystem.ts
│   │   ├── InteractionSystem.ts
│   │   ├── AnimationSystem.ts
│   │   ├── DialogueSystem.ts
│   │   ├── QuestSystem.ts
│   │   └── CombatSystem.ts
│   │
│   ├── world/
│   │   ├── World.ts
│   │   ├── WorldLoader.ts
│   │   ├── WorldState.ts
│   │   ├── WorldUpdater.ts
│   │   └── LegacyWorldAdapter.ts
│   │
│   ├── maps/
│   │   ├── HouseOfMensah/
│   │   ├── CapeCoast/
│   │   └── MissionSchool/
│   │
│   └── ui/
│       ├── HUD.tsx
│       ├── Dialogue.tsx
│       ├── QuestLog.tsx
│       └── Inventory.tsx

This gives the RPG a real home.

The Pixi patch should move with it
The patch we evaluated is a strong candidate to become the first renderer experiment inside the new game module, rather than being permanently embedded inside pay-it-forward.
Instead of:


pay-it-forward/
└── legacy-chapter-world.tsx

I would evolve toward:


legacy-rpg/
└── src/
    └── scenes/
        └── LegacyChapterWorld/

And eventually:


legacy-rpg/
├── scenes/
│   ├── HouseOfMensah/
│   ├── CapeCoastVillage/
│   ├── MissionSchool/
│   └── ColonialTown/

The House of Mensah should be the first true vertical slice.

The game can still open inside Niakofa
Decoupled does not mean a completely separate website.
The user experience can remain:


NIAKOFA
│
├── Home
├── Family
├── Vault
├── Record
├── Discover
│
└── PLAY YOUR LEGACY
        │
        ▼
   NIAKOFA LEGACY RPG
        │
        ▼
    HOUSE OF MENSAH

Technically:


React App
   │
   ├── Normal Niakofa UI
   │
   └── <LegacyGameHost>
             │
             ▼
        Pixi Game Canvas

So the game can still feel completely integrated.

I would use a Game Host boundary
The web app should communicate with the game through a clean interface.
For example:


interface LegacyGameHost {
  start(world: WorldSnapshot): void
  pause(): void
  resume(): void
  save(): Promise<void>
  destroy(): void
}

The game can emit events:


game.on("questCompleted", ...)
game.on("artifactDiscovered", ...)
game.on("memoryUnlocked", ...)
game.on("worldChanged", ...)

Then the Niakofa application can react:


GAME EVENT
    ↓
Artifact discovered
    ↓
Shared Legacy Data updates
    ↓
Family Vault updates

Or:


NEW FAMILY MEMORY RECORDED
        ↓
Niakofa backend processes it
        ↓
World version changes
        ↓
Game receives world update
        ↓
New NPC / quest / artifact appears

This is the architecture that preserves Niakofa's biggest differentiator.

My recommendation on pay-it-forward
I would not necessarily delete or rename pay-it-forward immediately.
First, inspect what it currently owns.
Then migrate gradually.
Phase 1


KEEP:
pay-it-forward

Create:


ADD:
legacy-rpg

Phase 2
Move only true game concerns:


Movement
Collision
Pixi renderer
Animation
Camera
NPC runtime
Map runtime

Phase 3
Create shared packages:


character-engine
legacy-data
game-contracts
world-schema

Phase 4
The old React Legacy Mode becomes the launcher/control layer rather than the game engine.

The architecture I recommend locking in


╔══════════════════════════════════════╗
║             NIAKOFA                  ║
║                                      ║
║  FAMILY + MEMORY + LEGACY PLATFORM   ║
╚═══════════════════╤══════════════════╝
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
╔═══════════════╗       ╔══════════════════╗
║ LEGACY DATA   ║       ║ NIAKOFA WEB UI   ║
║               ║       ║                  ║
║ Family Graph  ║       ║ Vault            ║
║ Memories      ║       ║ Recording        ║
║ Timeline      ║       ║ Family Tree      ║
║ Characters    ║       ║ Dashboards       ║
║ World State   ║       ║ Game Launcher    ║
╚═══════╤═══════╝       ╚════════╤═════════╝
        │                        │
        └────────────┬───────────┘
                     ▼
          ╔══════════════════════╗
          ║  NIAKOFA LEGACY RPG  ║
          ║                      ║
          ║ Dedicated Game Core  ║
          ║ Pixi Renderer        ║
          ║ Movement              ║
          ║ Collision             ║
          ║ Animation             ║
          ║ Camera                ║
          ║ NPCs                  ║
          ║ Maps                  ║
          ║ Quests                ║
          ║ World Simulation      ║
          ╚══════════════════════╝



Yes: create a standalone legacy-rpg game folder/module now and decouple the actual game runtime from pay-it-forward.
But do not fork the identity, data, character system, or Legacy knowledge system.
The target is:
Independent game runtime + shared Niakofa data contracts + one Character Evolution system + one living family world.

