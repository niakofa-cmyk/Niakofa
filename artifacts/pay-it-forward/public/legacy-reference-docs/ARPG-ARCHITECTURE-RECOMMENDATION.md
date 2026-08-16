# ARPG Architecture Recommendation
## Niakofa Legacy RPG — System Architecture Decision Record

> Source: Architecture evaluation document uploaded August 2026
> Status: **Active** — drives implementation decisions

---

## Summary Verdict

The ARPG Plugin Set and OCC Winner Pack change the architecture assessment:

| Previous | New |
|---|---|
| Build almost everything ourselves | Use ARPG as a conceptual reference + prototype layer |
| Grid-based movement | Pixel/dot-unit movement (DotMoveSystem pattern) |
| Static NPC placement | Dynamic entity generation from Family Vault data |
| Single character representation | Multi-representation pipeline (BUST/FACE/TV/SV) |

---

## System Architecture (Canonical)

```
         NIAKOFA PLATFORM
               │
  ┌────────────┴────────────┐
  │                         │
FAMILY / AI SYSTEM      RPG SYSTEM
  │                         │
  Family Vault          React/Vite Runtime
  Knowledge Graph            │
  AI extraction              │
  World Regeneration         ▼
  │                     ARPG Core concepts
  │                          │
  │           ┌──────────────┼──────────────┐
  │           │              │              │
  │       Movement       Collision      Interaction
  │           │              │              │
  │           └──────────────┼──────────────┘
  │                          │
  │                    Dynamic Events
  │                          │
  └──────────────► WORLD ◄───┘
                     │
              Custom Niakofa Art
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
    Kwame          NPCs        Environment
       │             │             │
       └─────────────┼─────────────┘
                     ▼
              PLAYABLE WORLD
```

---

## What To Take From ARPG Plugin Set

### INTEGRATE (concept → original Niakofa implementation)

| ARPG System | Niakofa Implementation |
|---|---|
| `ARPG_Core` | `NiakofaActionSystem` |
| `DotMoveSystem` | `NiakofaMovementSystem` — pixel movement, collision, slide-on-corner |
| `CharacterCollisionEx` | `NiakofaCollisionSystem` — AABB + interaction radius |
| `Dynamic Events` | `NiakofaWorldEntitySpawner` — Family Memory → NPC/Quest/Event |
| `ARPG_WeaponAnimation` | `LegacyCombatFSM` — existing combat system |
| `MapActorStatus` | `LegacyGameHUD` — existing HUD |

### TAKE AS REFERENCE/PROTOTYPE
- Sample map structure and tile layout
- Sample combat configuration patterns
- Event trigger radius patterns
- Enemy behavior state machine patterns

### SELECTIVELY USE (as prototype, replace before production)
- Effekseer effects as prototype VFX
- Audio files for prototype sound

### DO NOT MAKE FINAL NIAKOFA ART
- Stock fantasy characters
- Stock fantasy tiles/environments
- Generic RPG UI

---

## What To Take From OCC Winner Pack

### USE AS STRUCTURAL REFERENCE ONLY
The OCC EULA restricts images to RPG Maker engines. Do **not** use OCC images
in the Niakofa React runtime.

### Valuable pipeline reference:
```
CHARACTER ID
  │
  ├── PORTRAIT         (660×624) — menu, credits, chapter openers
  ├── DIALOGUE BUST    (500×624) — dialogue box
  ├── DIALOGUE FACE    (144×144) — HUD face chip
  ├── TV WALK          (144×192) — field walk sprite
  ├── SV BATTLE        (576×384) — side-view combat
  └── BONUS ICONS/WEAPONS
```

Niakofa implements this as `NiakofaCharacterAssetLibrary`.

---

## Licensing Boundaries

| Asset | Public GitHub | Production Game |
|---|---|---|
| ARPG Plugin JS files | ❌ No | With attribution: `© 2023 unagiootoro © Gotcha Gotcha Games Inc.` |
| ARPG sample assets | ❌ No | With attribution |
| OCC character PNGs | ❌ No | With licensed RPG Maker use only |
| Niakofa original art | ✅ Yes | ✅ Yes |
| Niakofa original code | ✅ Yes | ✅ Yes |

### Attribution required (if distributing with ARPG-derived concepts):
```
Action RPG system concepts informed by ARPG Plugin Set
© 2023 unagiootoro © Gotcha Gotcha Games Inc.
```

---

## Dynamic World Regeneration — The Key Insight

The ARPG "dynamic event generation" concept maps perfectly to the Niakofa vision:

```
FAMILY MEMORY
   │
   ▼  (Legacy extraction / AI)
New person discovered
   │
   ▼  (NiakofaWorldEntitySpawner)
AncestorRecord  ──► SpawnedNpc
                ──► SpawnedQuest
                ──► SpawnedEvent (landmark echo)
                ──► DemoJournalEntry

JSON example from World Regeneration API:
{
  "type": "new_ancestor",
  "name": "Ama Mensah",
  "location": "Cape Coast",
  "year": 1896,
  "role": "family_ancestor",
  "questSeed": "lost-cocoa-ledger",
  "landmark": "Mensah Trading House"
}
```

This is implemented in `src/lib/niakofa-world-entity-spawner.ts`.

---

## Movement System — Key Insight

Grid movement → NO  
Pixel/directional movement → YES

Kwame should be able to:
- Walk around people
- Approach a tree / elder / stall
- Navigate paths diagonally
- Collide naturally with geometry
- Trigger interactions by proximity (radius check, not grid snap)

Implemented in `src/lib/niakofa-movement-system.ts`.

Key DotMoveSystem concept adopted:
> "If character collides with the corner of a wall, move to the side where
> there is no corner." — Slide-on-corner, now in `stepMovement()`.

---

## Character Art Targets (Production Pipeline)

For each principal Niakofa character, the target art assets are:

```
Kwame Mensah (age 16, 1912, Cape Coast)

PORTRAIT          ← pending commission
DIALOGUE BUST     ← pending commission
FACE CHIP         ← pending commission
WALK CYCLE        ← ✅ 330 frames extracted, in atlas
COMBAT            ← partial (hurt frames ✅, attack pending)
CINEMATIC STILLS  ← pending
```

---

## Temporary Evaluation Categories (Recommended)

```
01_REFERENCE
  ARPG architecture patterns
  OCC character pipeline structure

02_PROTOTYPE_LAB (NOT in public repo)
  RPG Maker MZ project with ARPG system
  Movement / collision / combat feel testing
  Kwame character in MZ to test scale/camera

03_PRODUCTION (artifacts/pay-it-forward/)
  Original Niakofa React runtime
  Original Niakofa art pipeline
  NiakofaMovementSystem / NiakofaWorldEntitySpawner
  NiakofaCharacterAssetLibrary
```
