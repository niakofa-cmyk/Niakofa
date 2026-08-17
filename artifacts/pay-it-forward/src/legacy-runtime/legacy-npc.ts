/**
 * legacy-npc.ts — NPC entity system for the Niakofa Legacy walking world.
 *
 * Architecture drawn from:
 *   • Eldiron/crates/rusterix/src/server/entity.rs — entity with position,
 *     facing, health, behavior state; time-of-day schedule; pathfinding
 *   • MMOCore social + relationship events as design reference (not code)
 *
 * Each NPC has:
 *   1. Static definition  (NPCDefinition) — who they are, their schedule
 *   2. Runtime state      (NPCState)      — where they are right now
 *   3. Controller         (NPCController) — tick() drives the state machine
 *
 * NPCs know what time period is active (dawn/morning/afternoon/evening/night)
 * and change their goal tile based on their schedule. They walk toward the
 * goal tile using simple direct-approach pathfinding (Eldiron grid pattern).
 * When the player is adjacent they surface an interaction prompt.
 *
 * All rendering is done externally (caller draws an annotated PIXI.Graphics
 * or ActorSprite at state.x, state.y until full sprite sheets ship).
 */

export type TimeOfDay = "dawn" | "morning" | "afternoon" | "evening" | "night";

export type NPCBehaviorState =
  | "sleeping"     // Stationary at home — night or early dawn
  | "working"      // Doing their trade at their work location
  | "walking"      // Moving toward current goal tile
  | "idle"         // Standing, looking around (no goal within reach)
  | "talking"      // Triggered by player proximity — pauses all movement
  | "returning";   // Walking back to home tile at day's end

export type NPCFacing = "down" | "up" | "left" | "right";

/** Static definition — authored once, shared across all instances of this NPC. */
export interface NPCDefinition {
  id: string;
  name: string;
  description: string;
  /** Tile position of the NPC's home (where they sleep, spawn at dawn). */
  homeTile: { x: number; y: number };
  /** Work location and the time windows when they're active there. */
  schedule: NPCScheduleEntry[];
  /** Whether player can trigger dialogue by pressing Space nearby. */
  talkable: boolean;
  /** Dialogue keys surfaced when the player interacts. */
  dialogueLines: string[];
  /** Relationship level with Kwame (0–100). Affects dialogue depth + quest unlocks. */
  relationshipLevel: number;
  /** Visual color for placeholder rendering (until sprites ship). */
  placeholderColor: number;
}

export interface NPCScheduleEntry {
  timeOfDay: TimeOfDay | TimeOfDay[];
  goalTile: { x: number; y: number };
  behaviorHint: "working" | "idle" | "sleeping";
}

/** Runtime mutable state — one per live NPC instance. */
export interface NPCState {
  definitionId: string;
  x: number;                  // Current world position (tile space, fractional)
  y: number;
  facing: NPCFacing;
  behaviorState: NPCBehaviorState;
  relationshipLevel: number;  // Mutable — improves via player interaction
  health: number;             // 0–100; normally 100 for civilians
  isNearPlayer: boolean;      // True when within 1.5 tiles — drives prompt
}

const WALK_SPEED_TILES_PER_SEC = 1.2;   // NPCs walk slower than Kwame
const INTERACTION_RADIUS = 1.5;         // Tiles — distance for prompt
const ARRIVAL_TOLERANCE = 0.15;         // Tiles — "close enough" to goal

/** Derives time of day from a 0–23 hour value (game time). */
export function getTimeOfDay(gameHour: number): TimeOfDay {
  if (gameHour >= 5  && gameHour < 7)  return "dawn";
  if (gameHour >= 7  && gameHour < 12) return "morning";
  if (gameHour >= 12 && gameHour < 17) return "afternoon";
  if (gameHour >= 17 && gameHour < 21) return "evening";
  return "night";
}

/** Returns the active schedule entry for the given time of day. */
function getActiveSchedule(def: NPCDefinition, tod: TimeOfDay): NPCScheduleEntry {
  for (const entry of def.schedule) {
    const times = Array.isArray(entry.timeOfDay) ? entry.timeOfDay : [entry.timeOfDay];
    if (times.includes(tod)) return entry;
  }
  // Fallback — go home
  return { timeOfDay: tod, goalTile: def.homeTile, behaviorHint: "sleeping" };
}

/** Per-frame NPC controller. One controller per live NPC. */
export class NPCController {
  readonly definition: NPCDefinition;
  readonly state: NPCState;

  constructor(definition: NPCDefinition) {
    this.definition = definition;
    this.state = {
      definitionId: definition.id,
      x: definition.homeTile.x,
      y: definition.homeTile.y,
      facing: "down",
      behaviorState: "sleeping",
      relationshipLevel: definition.relationshipLevel,
      health: 100,
      isNearPlayer: false,
    };
  }

  /**
   * Advance NPC by deltaMs milliseconds.
   * @param playerPos — current player tile position (for proximity check)
   * @param gameHour  — current in-game hour 0–23
   * @param canOccupy — tile passability query (same interface as player collision)
   */
  tick(
    deltaMs: number,
    playerPos: { x: number; y: number },
    gameHour: number,
    canOccupy: (x: number, y: number) => boolean
  ) {
    const dt = deltaMs / 1000;
    const npc = this.state;

    // Proximity to player
    const dist = Math.hypot(playerPos.x - npc.x, playerPos.y - npc.y);
    npc.isNearPlayer = dist <= INTERACTION_RADIUS;

    // Pause movement while talking to player
    if (npc.behaviorState === "talking") return;

    // Resolve current goal tile from schedule
    const tod = getTimeOfDay(gameHour);
    const schedule = getActiveSchedule(this.definition, tod);
    const goal = schedule.goalTile;
    const hintState: NPCBehaviorState =
      schedule.behaviorHint === "sleeping" ? "sleeping"
      : schedule.behaviorHint === "idle" ? "idle"
      : "working";

    const dx = goal.x - npc.x;
    const dy = goal.y - npc.y;
    const distToGoal = Math.hypot(dx, dy);

    if (distToGoal < ARRIVAL_TOLERANCE) {
      // At goal — switch to schedule behavior hint
      npc.behaviorState = hintState;
      return;
    }

    // Walk toward goal — try combined direction, then axis-only (wall sliding)
    const speed = WALK_SPEED_TILES_PER_SEC * dt;
    const nx = dx / distToGoal * speed;
    const ny = dy / distToGoal * speed;

    const newX = npc.x + nx;
    const newY = npc.y + ny;

    if (canOccupy(Math.round(newX), Math.round(newY))) {
      npc.x = newX;
      npc.y = newY;
    } else if (canOccupy(Math.round(newX), Math.round(npc.y))) {
      npc.x = newX;
    } else if (canOccupy(Math.round(npc.x), Math.round(newY))) {
      npc.y = newY;
    }
    // If fully blocked, stay put and remain in walking state

    // Update facing from direction of motion
    npc.facing = deriveFacing(dx, dy);
    npc.behaviorState = "walking";
  }

  /** Called when the player initiates dialogue. */
  startTalking(): string {
    this.state.behaviorState = "talking";
    // Face toward player would be wired here if we pass player pos to interact()
    const line = this.definition.dialogueLines[
      Math.floor(this.state.relationshipLevel / 20) % this.definition.dialogueLines.length
    ];
    return line ?? `${this.definition.name} nods at you.`;
  }

  /** Called when dialogue ends. */
  endTalking() {
    this.state.behaviorState = "idle";
  }

  /** Relationship improves each time player interacts (max 100). */
  improveRelationship(amount = 5) {
    this.state.relationshipLevel = Math.min(100, this.state.relationshipLevel + amount);
  }
}

function deriveFacing(dx: number, dy: number): NPCFacing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

// ─── Cape Coast Compound NPC Definitions ─────────────────────────────────────

/** Ama Serwaa — Kwame's mother figure at the Mensah Compound. */
export const AMA_SERWAA: NPCDefinition = {
  id: "ama-serwaa",
  name: "Ama Serwaa",
  description: "Runs the Mensah household. Knows everyone's business in the compound.",
  homeTile: { x: 8, y: 5 },
  placeholderColor: 0xe88c6e, // warm terracotta
  talkable: true,
  relationshipLevel: 60,
  schedule: [
    { timeOfDay: "dawn",      goalTile: { x: 8, y: 5 }, behaviorHint: "sleeping" },
    { timeOfDay: "morning",   goalTile: { x: 5, y: 4 }, behaviorHint: "working" },   // compound courtyard
    { timeOfDay: "afternoon", goalTile: { x: 3, y: 6 }, behaviorHint: "working" },   // near the well
    { timeOfDay: "evening",   goalTile: { x: 6, y: 4 }, behaviorHint: "idle" },      // resting
    { timeOfDay: "night",     goalTile: { x: 8, y: 5 }, behaviorHint: "sleeping" },  // home
  ],
  dialogueLines: [
    "Kwame, have you eaten today?",
    "The market opens at sunrise. Don't be late.",
    "Your grandfather would be proud of what you are building.",
    "There is news from the elder. You should visit before nightfall.",
    "I have been keeping the family records safe. Come, I will show you.",
  ],
};

/** Kofi Asante — Fisherman who works at the Old Jetty in mornings. */
export const KOFI_ASANTE: NPCDefinition = {
  id: "kofi-asante",
  name: "Kofi Asante",
  description: "Veteran fisherman. Knows the river's moods better than anyone.",
  homeTile: { x: 11, y: 7 },
  placeholderColor: 0x5a8fa0, // river-blue
  talkable: true,
  relationshipLevel: 20,
  schedule: [
    { timeOfDay: "dawn",      goalTile: { x: 12, y: 8 }, behaviorHint: "working" },  // old jetty
    { timeOfDay: "morning",   goalTile: { x: 12, y: 8 }, behaviorHint: "working" },  // old jetty — fishing
    { timeOfDay: "afternoon", goalTile: { x: 10, y: 7 }, behaviorHint: "idle" },     // resting near home
    { timeOfDay: "evening",   goalTile: { x: 11, y: 7 }, behaviorHint: "idle" },
    { timeOfDay: "night",     goalTile: { x: 11, y: 7 }, behaviorHint: "sleeping" },
  ],
  dialogueLines: [
    "Tilapia run early. Be at the jetty before the mist clears.",
    "The old nets your grandfather made — I still use them.",
    "When the river rises, the catfish come closer to shore.",
    "I knew your family three generations back. Good people, all of them.",
    "The river holds memories, boy. Listen to it while you fish.",
  ],
};

/** Elder Nana Akua — Lives at the Elder's Dwelling, wisdom keeper. */
export const ELDER_NANA_AKUA: NPCDefinition = {
  id: "elder-nana-akua",
  name: "Nana Akua",
  description: "Village elder. Keeper of oral histories. Essential quest-giver.",
  homeTile: { x: 2, y: 7 },
  placeholderColor: 0xb8a060, // aged gold
  talkable: true,
  relationshipLevel: 40,
  schedule: [
    { timeOfDay: "dawn",      goalTile: { x: 2, y: 7 }, behaviorHint: "sleeping" },
    { timeOfDay: "morning",   goalTile: { x: 3, y: 6 }, behaviorHint: "working" },   // speaking with villagers
    { timeOfDay: "afternoon", goalTile: { x: 2, y: 7 }, behaviorHint: "idle" },      // resting at home
    { timeOfDay: "evening",   goalTile: { x: 3, y: 6 }, behaviorHint: "working" },   // evening gatherings
    { timeOfDay: "night",     goalTile: { x: 2, y: 7 }, behaviorHint: "sleeping" },
  ],
  dialogueLines: [
    "Sit with me, child. The village has much to tell.",
    "I remember your great-grandmother. Sharp mind, sharper tongue.",
    "Every family carries a wound and a gift. Your family carries both.",
    "The What Remains site speaks to those who listen. Have you visited?",
    "I will share the old songs with you. But first, prove you are ready.",
  ],
};

/** Abena Manu — Young woman at the Trading Post, market connections. */
export const ABENA_MANU: NPCDefinition = {
  id: "abena-manu",
  name: "Abena Manu",
  description: "Runs her family's trade stall. Knows what moves through the market.",
  homeTile: { x: 9, y: 3 },
  placeholderColor: 0xc87941, // warm amber
  talkable: true,
  relationshipLevel: 10,
  schedule: [
    { timeOfDay: "dawn",      goalTile: { x: 9, y: 3 }, behaviorHint: "sleeping" },
    { timeOfDay: "morning",   goalTile: { x: 10, y: 3 }, behaviorHint: "working" },  // market stall open
    { timeOfDay: "afternoon", goalTile: { x: 10, y: 3 }, behaviorHint: "working" },  // still at stall
    { timeOfDay: "evening",   goalTile: { x: 9, y: 4 }, behaviorHint: "idle" },      // closing up
    { timeOfDay: "night",     goalTile: { x: 9, y: 3 }, behaviorHint: "sleeping" },
  ],
  dialogueLines: [
    "What do you need today? I have fresh fish, cloth, and tools.",
    "Trade has been slow. The colonial restrictions are biting hard.",
    "I heard the elder has a task for someone brave enough.",
    "Your family name carries weight in this market. Use it wisely.",
    "The British tax everything now. We trade in memory and trust instead.",
  ],
};

/** All NPCs that live in the Cape Coast Compound scene. */
export const CAPE_COAST_NPCS: NPCDefinition[] = [
  AMA_SERWAA,
  KOFI_ASANTE,
  ELDER_NANA_AKUA,
  ABENA_MANU,
];
