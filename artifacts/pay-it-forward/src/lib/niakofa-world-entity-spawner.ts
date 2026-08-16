/**
 * NiakofaWorldEntitySpawner — dynamic NPC / quest / event generation.
 *
 * Architecture vision from the ARPG recommendation document:
 *
 *   FAMILY MEMORY  →  Legacy extraction  →  New person discovered
 *   →  NPC data  →  NPC generated  →  Placed into world
 *
 * The ARPG package demonstrated "dynamic event generation" where a SOURCE
 * EVENT is copied into the live map at runtime. Niakofa goes further: the
 * source data is the Family Vault knowledge graph, and the generated entities
 * are contextually grounded in real family history.
 *
 * This module is a pure TypeScript implementation — no RPG Maker code.
 * It is the bridge between the Family / AI system and the RPG runtime.
 *
 * Data flow:
 *   AncestorRecord  ─────┐
 *   EraContext       ─────┤─► spawnNpc()    →  SpawnedNpc[]
 *   RegionState      ─────┤─► spawnQuest()  →  SpawnedQuest
 *   WorldState       ─────┘─► spawnEvent()  →  SpawnedEvent
 */

import type { RegionId } from "@/lib/legacy-world-regions";

// ── Input types ────────────────────────────────────────────────────────────────

/** Minimal data extracted from a family memory / Family Vault record. */
export interface AncestorRecord {
  id: string;
  name: string;
  /** Year of birth or era year (e.g. 1896) */
  year: number;
  /** Geographic location name (e.g. "Cape Coast") */
  location: string;
  /** Contextual role in the story */
  role: "family_ancestor" | "community_elder" | "antagonist" | "ally" | "witness" | "unknown";
  /** Optional quest seed — a short story hook */
  questSeed?: string;
  /** Optional landmark associated with this person */
  landmark?: string;
  /** Traits extracted from oral history / AI */
  traits?: string[];
  /** Connection to the player character (e.g. "grandfather", "neighbour") */
  relationshipToPlayer?: string;
}

/** Current world state summary passed to spawner. */
export interface WorldSpawnContext {
  regionId: RegionId;
  phase: string;
  gameHour: number;
  /** Which ancestor IDs have already been placed this session. */
  alreadySpawned: Set<string>;
  /** Player's current trait map (affects which quests are available). */
  playerTraits: Record<string, number>;
}

// ── Output types ───────────────────────────────────────────────────────────────

/** An NPC dynamically generated from ancestor data. */
export interface SpawnedNpc {
  entityId: string;
  ancestorId: string;
  name: string;
  role: AncestorRecord["role"];
  regionId: RegionId;
  /** Tile coordinates within the region. */
  row: number;
  column: number;
  /** Opening dialogue line derived from the ancestor record. */
  dialogueSeed: string;
  /** Tags that appear in memory system after meeting this NPC. */
  memoryTags: string[];
  /** Whether this NPC unlocks a quest on interaction. */
  hasQuest: boolean;
  questId?: string;
}

/** A quest dynamically seeded from ancestor data. */
export interface SpawnedQuest {
  questId: string;
  title: string;
  description: string;
  /** Phase gate — quest is active only during this phase. */
  phase: string;
  objectives: SpawnedQuestObjective[];
  rewardTraits: Record<string, number>;
  /** The ancestor who seeds this quest. */
  ancestorId: string;
}

export interface SpawnedQuestObjective {
  id: string;
  label: string;
  kind: "talk" | "explore" | "collect" | "deliver" | "inspect";
  targetId?: string;
}

/** A dynamic map event (trigger zone, cutscene point, collectible drop). */
export interface SpawnedEvent {
  eventId: string;
  kind: "landmark" | "collectible" | "cutscene_trigger" | "historical_echo";
  regionId: RegionId;
  row: number;
  column: number;
  label: string;
  description: string;
  /** The ancestor whose memory created this event. */
  ancestorId: string;
  /** Phase during which this event is active. */
  triggerPhase: string;
}

// ── Spawn position oracle ──────────────────────────────────────────────────────

/**
 * Picks a map tile for an NPC using a deterministic hash of the ancestor ID
 * so the same ancestor always spawns in the same corner of a region.
 * This avoids needing a random seed from the caller.
 */
function deterministicSpawnPos(
  ancestorId: string,
  maxRow = 6,
  maxCol = 9,
): { row: number; column: number } {
  let h = 0;
  for (let i = 0; i < ancestorId.length; i++) h = (h * 31 + ancestorId.charCodeAt(i)) >>> 0;
  const row = Math.max(1, (h % maxRow));
  const column = Math.max(1, ((h >> 4) % maxCol));
  return { row, column };
}

// ── Dialogue seed generator ────────────────────────────────────────────────────

const DIALOGUE_TEMPLATES: Record<AncestorRecord["role"], string[]> = {
  family_ancestor: [
    "This land remembers us, even when we forget ourselves.",
    "Your name carries the weight of generations. Walk carefully.",
    "The cocoa trees we planted still fruit — do you know why?",
  ],
  community_elder: [
    "I have watched three generations grow up on this road.",
    "When the missionaries came, we hid the old ways in plain sight.",
    "Come, sit. Stories grow stale when they go untold.",
  ],
  antagonist: [
    "Progress has a price. Your family paid it. I merely collected.",
    "What you call a betrayal, I call survival.",
    "You look at me with your grandfather's eyes.",
  ],
  ally: [
    "I knew your family before the troubles. They were brave people.",
    "I can show you where the old path goes — if you trust me.",
    "Not everyone who helped was remembered. I made my peace with that.",
  ],
  witness: [
    "I was there when the ledger went missing. No one asked me.",
    "Memory is imperfect, but the land does not forget what happened here.",
    "They said it was an accident. We knew otherwise.",
  ],
  unknown: [
    "You seem familiar to me, stranger.",
    "This is an unusual time to be wandering these roads.",
    "Some questions are worth asking. Others are better left alone.",
  ],
};

function pickDialogue(role: AncestorRecord["role"], seed: string): string {
  const lines = DIALOGUE_TEMPLATES[role];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) >>> 0;
  return lines[h % lines.length];
}

// ── Main spawner functions ─────────────────────────────────────────────────────

/**
 * Generates a live NPC entity from an ancestor record and current world context.
 * Returns null if the ancestor has already been spawned or the context doesn't
 * match the ancestor's location.
 */
export function spawnNpc(
  ancestor: AncestorRecord,
  ctx: WorldSpawnContext,
): SpawnedNpc | null {
  if (ctx.alreadySpawned.has(ancestor.id)) return null;

  const pos = deterministicSpawnPos(ancestor.id);
  const questId = ancestor.questSeed
    ? `quest-${ancestor.id}-${ancestor.questSeed.replace(/\s+/g, "-").toLowerCase()}`
    : undefined;

  const memoryTags: string[] = [
    `ancestor:${ancestor.id}`,
    `role:${ancestor.role}`,
    ...(ancestor.traits ?? []).map(t => `trait:${t}`),
    ...(ancestor.relationshipToPlayer ? [`relation:${ancestor.relationshipToPlayer}`] : []),
  ];

  return {
    entityId: `npc-${ancestor.id}-${ctx.regionId}`,
    ancestorId: ancestor.id,
    name: ancestor.name,
    role: ancestor.role,
    regionId: ctx.regionId,
    row: pos.row,
    column: pos.column,
    dialogueSeed: pickDialogue(ancestor.role, ancestor.id),
    memoryTags,
    hasQuest: !!ancestor.questSeed,
    questId,
  };
}

/**
 * Generates a quest from an ancestor record.
 */
export function spawnQuest(
  ancestor: AncestorRecord,
  ctx: WorldSpawnContext,
): SpawnedQuest | null {
  if (!ancestor.questSeed) return null;

  const questId = `quest-${ancestor.id}-${ancestor.questSeed.replace(/\s+/g, "-").toLowerCase()}`;
  const objectives: SpawnedQuestObjective[] = [
    {
      id: `${questId}-talk`,
      label: `Speak with ${ancestor.name}`,
      kind: "talk",
      targetId: `npc-${ancestor.id}-${ctx.regionId}`,
    },
    ...(ancestor.landmark
      ? [{
          id: `${questId}-explore`,
          label: `Find ${ancestor.landmark}`,
          kind: "explore" as const,
          targetId: ancestor.landmark.toLowerCase().replace(/\s+/g, "-"),
        }]
      : []),
    {
      id: `${questId}-collect`,
      label: `Recover evidence of ${ancestor.questSeed}`,
      kind: "collect",
    },
  ];

  // Reward traits based on ancestor role.
  const rewardTraits: Record<string, number> = {
    historical_memory: 2,
    ...(ancestor.role === "community_elder" ? { wisdom: 3 } : {}),
    ...(ancestor.role === "ally" ? { trust: 2 } : {}),
    ...(ancestor.role === "witness" ? { investigation: 3 } : {}),
  };

  return {
    questId,
    title: `The ${ancestor.questSeed.split("-").join(" ")}`,
    description: `${ancestor.name} holds the key to understanding ${ancestor.questSeed}. ${ancestor.year > 0 ? `This happened around ${ancestor.year}.` : ""}`,
    phase: ctx.phase,
    objectives,
    rewardTraits,
    ancestorId: ancestor.id,
  };
}

/**
 * Generates a dynamic map event (landmark echo, collectible, etc.) from an
 * ancestor record. Useful for placing a historical trace on the map even when
 * the ancestor cannot appear in person (e.g. deceased, in a different era).
 */
export function spawnEvent(
  ancestor: AncestorRecord,
  ctx: WorldSpawnContext,
): SpawnedEvent {
  const pos = deterministicSpawnPos(`${ancestor.id}-event`, 6, 9);
  const kind: SpawnedEvent["kind"] = ancestor.landmark
    ? "landmark"
    : ancestor.role === "witness"
    ? "historical_echo"
    : ancestor.questSeed
    ? "cutscene_trigger"
    : "collectible";

  return {
    eventId: `event-${ancestor.id}-${ctx.regionId}`,
    kind,
    regionId: ctx.regionId,
    row: pos.row,
    column: pos.column,
    label: ancestor.landmark ?? `Memory of ${ancestor.name}`,
    description:
      ancestor.landmark
        ? `${ancestor.landmark} — connected to ${ancestor.name} (${ancestor.year})`
        : `A faint echo of ${ancestor.name}'s presence lingers here.`,
    ancestorId: ancestor.id,
    triggerPhase: ctx.phase,
  };
}

/**
 * Batch-spawns all entities for a list of ancestor records in the current
 * world context. Returns all generated NPCs, quests, and events.
 */
export function batchSpawn(
  ancestors: readonly AncestorRecord[],
  ctx: WorldSpawnContext,
): {
  npcs: SpawnedNpc[];
  quests: SpawnedQuest[];
  events: SpawnedEvent[];
} {
  const npcs: SpawnedNpc[] = [];
  const quests: SpawnedQuest[] = [];
  const events: SpawnedEvent[] = [];

  for (const ancestor of ancestors) {
    const npc = spawnNpc(ancestor, ctx);
    if (npc) {
      npcs.push(npc);
      ctx.alreadySpawned.add(ancestor.id);
    }

    const quest = spawnQuest(ancestor, ctx);
    if (quest) quests.push(quest);

    events.push(spawnEvent(ancestor, ctx));
  }

  return { npcs, quests, events };
}

// ── World regeneration bridge ──────────────────────────────────────────────────

/**
 * JSON shape produced by the backend World Regeneration API.
 * This is what the Niakofa backend will eventually POST when a family member
 * records a new story or uploads a document.
 *
 * Example payload from architecture doc:
 * {
 *   "type": "new_ancestor",
 *   "name": "Ama Mensah",
 *   "location": "Cape Coast",
 *   "year": 1896,
 *   "role": "family_ancestor",
 *   "questSeed": "lost-cocoa-ledger",
 *   "landmark": "Mensah Trading House"
 * }
 */
export interface WorldRegenerationPayload {
  type: "new_ancestor" | "updated_ancestor" | "new_location" | "new_event";
  name: string;
  location: string;
  year: number;
  role: AncestorRecord["role"];
  questSeed?: string;
  landmark?: string;
  traits?: string[];
  relationshipToPlayer?: string;
}

/**
 * Converts a raw World Regeneration API payload into an AncestorRecord
 * suitable for the spawner. This is the bridge between backend API and
 * the Niakofa RPG runtime.
 */
export function payloadToAncestor(payload: WorldRegenerationPayload): AncestorRecord {
  const id = `${payload.name.toLowerCase().replace(/\s+/g, "-")}-${payload.year}`;
  return {
    id,
    name: payload.name,
    year: payload.year,
    location: payload.location,
    role: payload.role,
    questSeed: payload.questSeed,
    landmark: payload.landmark,
    traits: payload.traits,
    relationshipToPlayer: payload.relationshipToPlayer,
  };
}
