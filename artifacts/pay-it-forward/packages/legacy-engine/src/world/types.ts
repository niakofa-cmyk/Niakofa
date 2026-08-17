export type Weather =
  | "clear"
  | "cloudy"
  | "light_rain"
  | "heavy_rain"
  | "storm"
  | "harmattan_fog";

export type Season = "dry" | "wet" | "harmattan";

export type TimeOfDayPhase =
  | "dawn"
  | "morning"
  | "midday"
  | "afternoon"
  | "sunset"
  | "evening"
  | "night";

export interface QuestState {
  id: string;
  status: "locked" | "active" | "completed" | "failed";
  /** Free-form variant key, e.g. "tracks_in_the_storm" vs "the_missing_mule" */
  variant?: string;
  updatedOnDay: number;
}

export interface NPCState {
  id: string;
  /** Current schedule location key, e.g. "farm", "market", "compound" */
  location: string;
  relationship?: number; // -100..100, suspicion/trust axis
  alive: boolean;
}

export interface LandmarkState {
  id: string;
  discovered: boolean;
  condition: "broken" | "damaged" | "repaired" | "normal";
}

/**
 * The single persistent world document. Every system reads from this and
 * writes back to it through WorldState's typed mutators (never directly),
 * so every mutation can emit the right event and bump worldVersion.
 */
export interface WorldStateData {
  worldVersion: number;
  year: number;
  day: number; // absolute day count since world start
  time: number; // minutes since midnight, 0-1439
  season: Season;
  weather: Weather;
  storyPhase: string;

  attributes: {
    courage: number;
    wisdom: number;
    leadership: number;
    compassion: number;
  };

  familyReputation: number;

  quests: Record<string, QuestState>;
  npcs: Record<string, NPCState>;
  landmarks: Record<string, LandmarkState>;
  discoveredLocations: string[];
  completedEvents: string[];
  activeEvents: string[];
  worldFlags: Record<string, boolean | number | string>;
}

export function createDefaultWorldState(): WorldStateData {
  return {
    worldVersion: 1,
    year: 1894,
    day: 1,
    time: 6 * 60, // 06:00
    season: "dry",
    weather: "clear",
    storyPhase: "chapter1_cape_coast",
    attributes: { courage: 0, wisdom: 0, leadership: 0, compassion: 0 },
    familyReputation: 0,
    quests: {},
    npcs: {},
    landmarks: {},
    discoveredLocations: [],
    completedEvents: [],
    activeEvents: [],
    worldFlags: {},
  };
}
