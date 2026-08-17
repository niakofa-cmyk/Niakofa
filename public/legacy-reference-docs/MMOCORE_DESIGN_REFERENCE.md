# MMOCore Design Reference — Niakofa Legacy

**Source:** MMOCore-master (Indyuce/MMOCore — COMMERCIAL LICENSE)  
**Analysis date:** August 2026  
**CRITICAL:** MMOCore's license requires a purchased commercial license for use.
**NO MMOCore code has been or will be included in the Niakofa repository.**
This document records design concepts extracted as ideas only.

---

## What MMOCore Is

MMOCore is a Minecraft/Bukkit plugin providing a comprehensive MMO/RPG systems API. Despite being Java/Bukkit, its system design maps almost perfectly to Niakofa's gameplay needs. It contains:

| MMOCore System | Relevance to Niakofa |
|---|---|
| `PlayerAttributes` + `AttributeModifier` | **HIGH** — 6-attribute model |
| `PlayerExperienceGainEvent` | **HIGH** — XP event pattern |
| `PlayerLevelUpEvent` / `PlayerLevelChangeEvent` | **HIGH** — level-up callbacks |
| `PlayerCombatEvent` | **HIGH** — combat XP trigger |
| `PlayerQuests` + `QuestProgress` + `ObjectiveProgress` | **HIGH** — quest progression |
| `Quest` + quest objectives | **HIGH** — world-embedded quest model |
| `FishingManager` + `FishingDropItem` | **HIGH** — fishing design |
| `PlayerResourceUpdateEvent` | MEDIUM — health/stamina events |
| `PartyManager` | LOW — Niakofa is single-player |
| Social: `FriendRequest`, `GuildChatEvent` | LOW — adapted as Relationships |

---

## Key Design Concepts Adopted (Niakofa-Native Implementation)

### 1. Attribute System (→ `legacy-attributes.ts`)

**MMOCore:** `PlayerAttributes` with modifier stacking; global attribute registry.  
**Niakofa adaptation:**

```typescript
// src/legacy-runtime/legacy-attributes.ts
// SIX attributes — each is an independent XP track (not class-based):
type AttributeId =
  | "strength"    // MMOCore: STRENGTH — combat damage, fishing rod power
  | "endurance"   // MMOCore: CONSTITUTION — HP, stamina, fishing duration
  | "wisdom"      // MMOCore: INTELLIGENCE — dialogue depth, memory clarity
  | "legacy"      // Niakofa-unique — Family Vault contribution, knowledge graph
  | "kinship"     // Niakofa-unique — relationships, NPC trust, community
  | "river_lore"  // Niakofa-unique — fishing mastery, fish species, River Memory
```

**Why 6 separate tracks instead of a class system:**  
Kwame's story isn't about picking a class. It's about what he actually does. Walking to the river and fishing grows `river_lore`. Helping the elder grows `kinship + legacy`. Getting hit in combat grows `endurance`. The attributes are a *consequence* of lived actions, not a character-build choice.

**Level progression:** Each attribute runs 1–10 independently. 50 XP per level (linear). Each level-up fires a callback enabling dialogue, story, or quest unlocks.

### 2. Event-Driven XP System (→ `KwameAttributeSystem.processEvent()`)

**MMOCore:** `PlayerExperienceGainEvent` fired from any game action.  
**Niakofa adaptation:**

```typescript
// Every meaningful world action is typed:
type AttributeEvent =
  | { type: "combat_hit";       damage: number }
  | { type: "fish_caught";      fishRarity: number }
  | { type: "river_memory";     depth: number }
  | { type: "quest_completed";  questLevel: number }
  | { type: "npc_talked";       npcId: string }
  | { type: "npc_helped";       npcId: string }
  | { type: "memory_echo";      ancestorId: string }
  | { type: "vault_contribution"; importance: number }
  | { type: "journal_entry";    wordCount: number }
```

**Why not a flat XP number:** Each event type maps to 1-2 specific attributes, so the same action grows only the relevant skills. Fighting grows strength+endurance. Fishing grows river_lore+endurance. Talking to elders grows kinship+wisdom. This is what makes Kwame feel like a specific character, not a generic avatar.

### 3. Fishing System (→ `legacy-world/fishing-runtime.ts`)

**MMOCore:** `FishingManager`, `FishingDropItem`, `CustomPlayerFishEvent` — fishing as a profession with XP.  
**Niakofa adaptation (taken much further):**

```
Kwame walks to river bank
  ↓
[Space] — cast (fishing FSM starts: idle → casting → waiting → bite → reeling → catch)
  ↓
Species determined by: river_lore level + time of day + location
  ↓
Catch: Fish + possible artifact + possible River Memory
  ↓
River Memory (10% base chance + wisdom bonus): oral history discovery
  ↓
Journal update + Knowledge Graph update + river_lore XP
  ↓
World changes (some memories unlock new locations or NPC dialogue)
```

**Fish species (level-gated by river_lore):**
| Level | Species |
|---|---|
| 1 | Tilapia, Nile Tilapia |
| 2 | Volta Barb, Clarias Catfish |
| 3 | Jewel Cichlid |
| 4–6 | Nile Perch + River Memory artifacts |

This is NOT MMOCore fishing. It is Niakofa Fishing: every catch is potentially a piece of family history.

### 4. Quest System (→ World-Embedded Quests)

**MMOCore:** `PlayerQuests`, `QuestProgress`, `ObjectiveProgress`, `GoToObjective`, `KillMobObjective`.  
**Niakofa adaptation:**

Quests are NOT dashboard cards. Quests happen IN the world:
- `GoToObjective` → Walk to a location in the real map (not a UI button)
- `KillMobObjective` → Defeat an enemy in the real combat arena
- `ClickonObjective` → Interact with a WorldActivity in the world

Quest triggers from NPCs: Talking to an NPC with enough kinship + wisdom unlocks new quest dialogue lines. Quest acceptance is implicit — the NPC says something and Kwame acts on it.

Quest completion fires both `quest_completed` AttributeEvent AND a World Mutation, updating WorldState so future NPC dialogue reflects the completed quest.

**World-embedded quest triggers in `legacy-world/activities.ts`:**
```typescript
// Each WorldActivity is a quest-objective embedded at a real location:
{ id: "chapter1-enter-compound", type: "quest-objective",
  locationId: "mensah-compound", onComplete: (...) → WorldMutation[] }
```

### 5. Combat Events (→ `LegacyBattleScene` + `KwameAttributeSystem`)

**MMOCore:** `PlayerCombatEvent`, `PlayerResourceUpdateEvent`.  
**Niakofa adaptation:**

Combat XP events dispatched from `LegacyBattleScene` to `KwameAttributeSystem`:
```typescript
// On every hit landed:
attrs.processEvent({ type: "combat_hit", damage: hitDamage });
// On kill:
attrs.processEvent({ type: "combat_kill", enemyLevel: 1 });
```

Combat modifiers scale with attribute levels:
```typescript
// KwameAttributeSystem.getCombatModifiers()
damageMultiplier: 1 + (strength.level - 1) * 0.08   // +8% per strength level
healthBonus:      (endurance.level - 1) * 10          // +10 HP per endurance level
legacyBurstRate:  1 + (legacy.level - 1) * 0.05      // +5% burst charge per legacy
```

### 6. Social / Relationship System

**MMOCore:** `FriendRequest`, `PartyManager`, social events.  
**Niakofa adaptation (completely different):**

NPCs have `relationshipLevel: 0–100` (not a friend-list). It rises through:
- Talking to them: +5 kinship XP, +5 relationship
- Completing tasks they give: +15 kinship XP, +15 relationship
- Giving them items (future): varies

Higher relationship level unlocks:
- Deeper dialogue lines (indexed by `Math.floor(relationship / 20) % lines.length`)
- New quest dialogues
- Story reveals about the family's history

---

## What MMOCore's Structure Taught Us About Architecture

The most valuable insight from MMOCore is its **event-driven, decoupled architecture**:

```
World Action
    ↓
Typed Event (PlayerCombatEvent, CustomPlayerFishEvent, etc.)
    ↓
Event Bus
    ↓
Multiple independent systems react:
  - XP system gets xp
  - Quest system checks objectives
  - Achievement system checks unlocks
  - Social system checks relationship events
```

Niakofa's equivalent:
```
World Action
    ↓
AttributeEvent (typed)
    ↓
KwameAttributeSystem.processEvent()
    ↓
XP → possible level-up → onLevelUp() callback
    ↓
WorldMutation → MinimalWorldState update → Family Vault sync
```

---

## What We Did NOT Take from MMOCore

- **No Java code** — Niakofa is TypeScript/React
- **No class/skill-tree system** — Niakofa uses lived-action attributes
- **No party/guild systems** — Niakofa is a single-player narrative RPG
- **No economy/currency** — replaced by relationships, knowledge, and legacy
- **No PvP** — replaced by story-driven combat

---

## License Compliance Confirmation

MMOCore requires a commercial license purchased from https://www.spigotmc.org/resources/mmocore.70575/.

The Niakofa repository contains:
- ✅ This reference document (analysis of publicly visible structure)
- ❌ NO Java files from MMOCore
- ❌ NO copied API designs (all implementations are original TypeScript)
- ❌ NO class names or method signatures copied verbatim
