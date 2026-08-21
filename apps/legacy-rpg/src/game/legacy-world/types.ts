/**
 * Core shapes making Fishing, Living Relationships, Chapters, and What
 * Remains speak one language instead of being separate components/panels.
 * Every one of them becomes a WorldLocation + WorldActivity that produces
 * WorldMutations against the same persistent state -- never a route change,
 * never a full-screen panel that unmounts the PixiJS world underneath it.
 */

export type LocationType = "district" | "building" | "landmark" | "activity-spot" | "memory-site";

export type ActivityType =
  | "fishing"
  | "dialogue"
  | "combat-rite"
  | "memory-echo"
  | "quest-objective"
  | "inspect";

/** inline = stays in free-roam world; focused = camera tightens/controls swap, but the world stays mounted underneath -- never unmounted, never a route change. */
export type ActivityRuntime = "inline" | "focused";

export interface WorldLocation {
  id: string;
  name: string;
  type: LocationType;
  /** World-space bounds in tile units, matching legacy-map-engine.ts's TILE_SIZE_PX convention. */
  bounds: { x: number; y: number; w: number; h: number };
  layer?: number;
  walkable?: boolean;
  interactable?: boolean;
  defaultPrompt?: string;
  stateKey?: string;
  tags: string[];
}

export interface ActivityRequirements {
  quest?: string;
  relationship?: { npcId: string; minLevel: number };
  weather?: string[];
  timeOfDay?: string[];
  item?: string;
  custom?: (ctx: ActivityContext) => boolean;
}

export interface ActivityContext {
  playerId: string;
  locationId: string;
  weather?: string;
  timeOfDay?: string;
  worldVersion: number;
  [key: string]: unknown;
}

export type WorldMutation =
  | { type: "set-location-state"; locationId: string; state: string }
  | { type: "spawn-npc"; npcId: string; locationId: string }
  | { type: "unlock-path"; pathId: string }
  | { type: "add-memory-echo"; locationId: string; memoryId: string }
  | { type: "change-building"; buildingId: string; variant: "prosperous" | "ravaged" | "repaired" }
  | { type: "quest-echo"; questId: string }
  | { type: "grant-item"; itemId: string; qty?: number }
  | { type: "relationship-delta"; npcId: string; delta: number }
  | { type: "journal-entry"; title: string; body: string; tags?: string[] };

export interface WorldActivity {
  id: string;
  locationId: string;
  type: ActivityType;
  runtime: ActivityRuntime;
  canRepeat: boolean;
  requirements?: ActivityRequirements;
  onComplete: (result: Record<string, unknown>, ctx: ActivityContext) => WorldMutation[];
  label?: string;
}
