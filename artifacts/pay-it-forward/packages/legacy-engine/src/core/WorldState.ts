import type { EventBus } from "./EventBus.js";
import type { WorldEvents } from "./events.js";
import {
  createDefaultWorldState,
  type WorldStateData,
  type QuestState,
  type NPCState,
  type LandmarkState,
  type Weather,
  type Season,
} from "../world/types.js";

/**
 * WorldState
 * ----------
 * The persistent world document described in the design doc:
 *   worldVersion, currentYear, currentDay, currentTime, weather, season,
 *   npcStates, questStates, landmarkStates, discoveredLocations, ...
 *
 * Rules this class enforces:
 *  1. Nothing mutates the underlying data object directly - every change
 *     goes through a typed method here, so every change can (a) emit an
 *     event other systems react to and (b) be captured for save/diff.
 *  2. World regeneration (new family knowledge -> new content) is
 *     additive: mergeContentSeed() only ever *adds* npcs/landmarks/quests,
 *     it never deletes or overwrites existing world content. That matches
 *     "the world grows, it doesn't randomly regenerate."
 */
export class WorldState {
  private data: WorldStateData;
  private readonly bus: EventBus<WorldEvents>;

  constructor(bus: EventBus<WorldEvents>, initial?: Partial<WorldStateData>) {
    this.bus = bus;
    this.data = { ...createDefaultWorldState(), ...initial };
  }

  /** Read-only snapshot. Callers must not mutate this. */
  get snapshot(): Readonly<WorldStateData> {
    return this.data;
  }

  get version(): number {
    return this.data.worldVersion;
  }

  // ---- generic version bump, used by every mutator below -----------------
  private bump(reason: string): void {
    this.data.worldVersion += 1;
    this.bus.emit("world:versionChanged", { version: this.data.worldVersion, reason });
  }

  // ---- time / calendar -----------------------------------------------------
  setTime(day: number, time: number, year = this.data.year): void {
    this.data.day = day;
    this.data.time = time;
    this.data.year = year;
  }

  // ---- weather ---------------------------------------------------------
  setWeather(weather: Weather): void {
    if (weather === this.data.weather) return;
    const from = this.data.weather;
    this.data.weather = weather;
    this.bus.emit("weather:changed", { from, to: weather, season: this.data.season });
    this.bump(`weather -> ${weather}`);
  }

  setSeason(season: Season): void {
    this.data.season = season;
  }

  // ---- attributes / reputation ------------------------------------------
  addAttribute(key: keyof WorldStateData["attributes"], delta: number): void {
    this.data.attributes[key] += delta;
    this.bump(`attribute:${key}+${delta}`);
  }

  addFamilyReputation(delta: number): void {
    this.data.familyReputation += delta;
    this.bump(`familyReputation+${delta}`);
  }

  // ---- flags -------------------------------------------------------------
  setFlag(flag: string, value: boolean | number | string): void {
    this.data.worldFlags[flag] = value;
    this.bus.emit("world:flagChanged", { flag, value });
    this.bump(`flag:${flag}`);
  }

  getFlag(flag: string): boolean | number | string | undefined {
    return this.data.worldFlags[flag];
  }

  // ---- quests --------------------------------------------------------------
  upsertQuest(quest: QuestState): void {
    const prev = this.data.quests[quest.id];
    this.data.quests[quest.id] = quest;
    if (quest.status === "active" && prev?.status !== "active") {
      this.bus.emit("quest:unlocked", { questId: quest.id, reason: quest.variant ?? "default" });
    } else if (quest.status === "completed" && prev?.status !== "completed") {
      this.data.completedEvents.push(`quest:${quest.id}`);
      this.bus.emit("quest:completed", { questId: quest.id });
    } else if (quest.status === "failed" && prev?.status !== "failed") {
      this.bus.emit("quest:failed", { questId: quest.id });
    }
    this.bump(`quest:${quest.id}:${quest.status}`);
  }

  getQuest(id: string): QuestState | undefined {
    return this.data.quests[id];
  }

  // ---- npcs ----------------------------------------------------------------
  upsertNPC(npc: NPCState): void {
    const prev = this.data.npcs[npc.id];
    this.data.npcs[npc.id] = npc;
    if (!prev || prev.location !== npc.location) {
      this.bus.emit("npc:scheduleChanged", { npcId: npc.id, location: npc.location });
    }
  }

  getNPC(id: string): NPCState | undefined {
    return this.data.npcs[id];
  }

  // ---- landmarks -------------------------------------------------------
  upsertLandmark(landmark: LandmarkState): void {
    this.data.landmarks[landmark.id] = landmark;
    this.bump(`landmark:${landmark.id}:${landmark.condition}`);
  }

  discoverLocation(id: string): void {
    if (this.data.discoveredLocations.includes(id)) return;
    this.data.discoveredLocations.push(id);
    this.bump(`discovered:${id}`);
  }

  // ---- world regeneration (additive merge only) ---------------------------
  /**
   * Merge a "content seed" produced by the Family Knowledge Engine
   * (e.g. a new ancestor mentioned in a recorded interview becomes a new
   * NPC + landmark + quest). Existing content is never removed or
   * overwritten - only new ids are added, matching "world grows, doesn't
   * randomly regenerate."
   */
  mergeContentSeed(seed: {
    npcs?: NPCState[];
    landmarks?: LandmarkState[];
    quests?: QuestState[];
    reason: string;
  }): void {
    for (const npc of seed.npcs ?? []) {
      if (!this.data.npcs[npc.id]) this.data.npcs[npc.id] = npc;
    }
    for (const landmark of seed.landmarks ?? []) {
      if (!this.data.landmarks[landmark.id]) this.data.landmarks[landmark.id] = landmark;
    }
    for (const quest of seed.quests ?? []) {
      if (!this.data.quests[quest.id]) this.data.quests[quest.id] = quest;
    }
    this.bump(`regeneration:${seed.reason}`);
  }

  // ---- persistence -----------------------------------------------------
  toJSON(): WorldStateData {
    return JSON.parse(JSON.stringify(this.data));
  }

  static fromJSON(bus: EventBus<WorldEvents>, json: WorldStateData): WorldState {
    return new WorldState(bus, json);
  }
}
