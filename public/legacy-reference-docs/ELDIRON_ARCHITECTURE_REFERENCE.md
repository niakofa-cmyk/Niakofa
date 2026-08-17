# Eldiron Architecture Reference — Niakofa Legacy

**Source:** Eldiron-master (MIT license — https://github.com/markusmoenig/Eldiron)  
**Analysis date:** August 2026  
**Use in Niakofa:** Architecture reference and conceptual extraction ONLY.
No Rust code has been or will be included in Niakofa's runtime.

---

## What Eldiron Is

Eldiron is an MIT-licensed cross-platform retro RPG creator supporting 2D, isometric, and first-person RPGs. Its core engine is **Rusterix** (Rust), built on **SceneVM** (wGPU-based layer renderer) and **TheFramework** (cross-platform UI).

Key subsystems directly relevant to Niakofa:

| Eldiron Subsystem | File | Size | Niakofa Relevance |
|---|---|---|---|
| Collision world | `crates/rusterix/src/collision_world.rs` | 111 KB | **HIGH** — collision architecture |
| Entity runtime | `crates/rusterix/src/server/entity.rs` | 30 KB | **HIGH** — NPC entity pattern |
| Region/map host | `crates/rusterix/src/server/region.rs` | 885 KB | **HIGH** — world region model |
| Region context | `crates/rusterix/src/server/regionctx.rs` | 47 KB | MEDIUM — region state |
| Collision probe | `creator/src/tools/collision_probe.rs` | 19 KB | MEDIUM — debug/editor tool |
| Entity editor | `creator/src/tools/entity.rs` | 32 KB | LOW — editor only |

---

## Key Architectural Patterns Extracted

### 1. Entity Architecture (→ Niakofa NPC system)

Eldiron's `entity.rs` defines entities as:
- **Static definition** — id, name, behavior scripts, schedule
- **Runtime state** — position (float), facing, health, animation state
- **Behavior controller** — tick(deltaMs, world) → updates state

**Applied in Niakofa as:**
```typescript
// src/legacy-runtime/legacy-npc.ts
class NPCController {
  definition: NPCDefinition;   // ← static (Eldiron: EntityDefinition)
  state: NPCState;             // ← runtime (Eldiron: EntityInstance)
  tick(deltaMs, playerPos, gameHour, canOccupy) // ← Eldiron: server_tick()
}
```

The key insight from Eldiron: **separate the visual sprite from the collision body**. The character is a rectangle in world-space; the art is drawn relative to it. This prevents sprite-collision coupling.

### 2. Collision World (→ Niakofa Layer 5)

Eldiron's `collision_world.rs` implements:
- AABB (axis-aligned bounding box) collision against tile rectangles
- Separate hurtbox/hitbox volumes for combat
- Query: `canMoveTo(from, to, size)` → bool + slide vector

**Applied in Niakofa as:**
The existing `LegacyActorController.tick()` (lines 98-99 of `legacy-animation-fsm.ts`) already applies the axis-split wall-sliding pattern Eldiron uses:
```typescript
if (canOccupy(nextX, this.state.y)) this.state.x = nextX;  // try X alone
if (canOccupy(this.state.x, nextY)) this.state.y = nextY;  // try Y alone
```
This means walking diagonally into a wall slides along it rather than stopping dead.

NPC controllers use the same `canOccupy` callback for consistent behavior.

### 3. Region/Map Model (→ Niakofa World Regions)

Eldiron's `region.rs` defines:
- **Region** — a named, bounded section of the world (equivalent to Niakofa's `WorldRegion`)
- **Sectors** — sub-regions within a map (landmark zones, interior areas)
- **Entities** — live inside regions, move between them via portals
- **Region hosting** — server-side, clients receive diffs

**Applied in Niakofa as:**
- `legacy-world-regions.ts` — 12-region scaffold matching Eldiron's region concept
- `legacy-world/locations.ts` — WorldLocation = Eldiron sector concept
- Portal system: `LegacyWorldMapPins` — macro overworld with region transitions

### 4. Time-of-Day Schedule System (→ Niakofa NPC Schedules)

Eldiron's scripting VM supports time-based NPC behavior scripts. Niakofa adapts this as:
```typescript
// NPCScheduleEntry in legacy-npc.ts
{ timeOfDay: "morning", goalTile: { x: 12, y: 8 }, behaviorHint: "working" }
```

Five time periods: `dawn | morning | afternoon | evening | night`  
Each NPC has a schedule array. `NPCController.tick()` reads the current game hour, evaluates the schedule, and pathfinds toward the goal tile.

### 5. Pathfinding (→ Niakofa NPC Movement)

Eldiron implements A* pathfinding in its region server. Niakofa currently uses **direct-approach pathfinding** (move in direction of goal, wall-slide), which is sufficient for open maps. A* will be added if NPCs need to navigate around complex obstacles.

Current NPC pathfinding:
```typescript
// normalized direction vector toward goal + wall sliding
const nx = (goal.x - npc.x) / dist * speed;
const ny = (goal.y - npc.y) / dist * speed;
if (canOccupy(newX, newY)) { npc.x = newX; npc.y = newY; }
else if (canOccupy(newX, npc.y)) { npc.x = newX; }
else if (canOccupy(npc.x, newY)) { npc.y = newY; }
```

### 6. Procedural Systems (→ future World Regeneration)

Eldiron's tilegraph system generates:
- Color, height, material, particle, lighting data
- Procedural terrain tiles (stone, grass, dirt, water)
- Procedural geometry via node graphs

**Applied in Niakofa:** This is the conceptual basis for the **World Regeneration** system:
```
Family Vault → AI → Knowledge Graph → World Generation Instructions
→ Niakofa World Runtime → Terrain / NPCs / Events (Eldiron-inspired procedural)
```

Material Maker (the `.dmg` tool) will be used to generate procedural ground/wall/surface materials for this pipeline.

### 7. Lighting System (→ Niakofa Day/Night)

Eldiron's SceneVM renderer supports per-layer lighting. Niakofa's equivalent:
- `LegacyWeatherOverlay` — atmospheric overlays driven by era/season
- Future: `LegacyLightingLayer` — per-tile light values, torch/ambient, day/night gradient

---

## What We Did NOT Take from Eldiron

- **The Rust engine binary** — Niakofa runs in the browser; Rust/wGPU binaries are not portable
- **The editor (Eldiron Creator)** — Niakofa has its own authoring pipeline
- **The scripting VM** — Niakofa uses TypeScript directly
- **The network/multiplayer layer** — Niakofa is a single-player narrative RPG

---

## Integration Boundary

```
NIAKOFA RUNTIME
  LegacyGameCanvas.tsx           ← PixiJS host (not Rusterix)
  legacy-npc.ts                  ← NPCController (Eldiron entity pattern, TS)
  legacy-animation-fsm.ts        ← Wall-sliding collision (Eldiron AABB pattern, TS)
  legacy-scene-renderer.ts       ← 6-layer renderer (Eldiron SceneVM concepts, PixiJS)
  legacy-world-regions.ts        ← Region/sector model (Eldiron region concepts, TS)
```

All code is native TypeScript/PixiJS. Eldiron contributed the *architecture* of these systems, not any actual Rust code.
