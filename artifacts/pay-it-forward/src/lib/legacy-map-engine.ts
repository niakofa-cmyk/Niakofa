/**
 * Legacy Map/Environment engine — types only, no rendering implementation.
 *
 * There is currently no map rendering system in legacy-chapter.tsx (see
 * docs/BUGS_AND_FINDINGS.md §2) — this is a from-scratch design, not a
 * refactor of existing code.
 *
 * World unit matches docs/calibration-sheet.json: 64x64px tiles, 1920x1080
 * target resolution, semi-top-down 2.5D camera.
 */

import type { LegacyArtTier } from "./legacy-hand-drawn-assets";
import type { NPCDefinition } from "@/legacy-runtime/legacy-npc";

export const TILE_SIZE_PX = 64;

export type LegacyMapLayerKind =
  | "ground"
  | "decoration"
  | "building"
  | "structure"  // fences, gates, walls — between ground and buildings
  | "prop"
  | "foreground"; // renders in front of the player — porches, tree canopies, arches

export type LegacyLightingState = "morning" | "afternoon" | "evening" | "night" | "rainy";

export interface LegacyMapLayer {
  kind: LegacyMapLayerKind;
  assetId: string;
  artTier: LegacyArtTier;
  x: number; // world units (tiles), not pixels
  y: number;
  widthTiles?: number;
  heightTiles?: number;
}

export interface LegacyCollisionShape {
  x: number;
  y: number;
  widthTiles: number;
  heightTiles: number;
  /** true = player/NPCs cannot enter; false = triggers an interaction instead of blocking */
  solid: boolean;
}

export interface LegacyInteractionPoint {
  id: string;
  x: number;
  y: number;
  /** What this resolves to — a dialogue node, a Family Vault artifact reveal, a quest step, etc. */
  triggers:
    | { type: "dialogue"; nodeId: string }
    | { type: "vaultArtifact"; artifactId: string }
    | { type: "questStep"; questId: string; stepId: string }
    | { type: "worldEvolutionReveal"; eventId: string };
}

export interface LegacyNpcSpawn {
  characterId: string;
  role: "protagonist" | "antagonist" | "namedNPC" | "background";
  x: number;
  y: number;
  facing: "up" | "down" | "left" | "right";
}

/** A deliberately authored hostile encounter, separate from family NPCs. */
export interface LegacyCombatEncounter {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  rewardItemId: string;
  rewardQuestId: string;
}

/**
 * One playable location. `worldStateVariant` lets the SAME location render
 * differently across the family's timeline (prosperous compound → collapsed
 * compound) without duplicating map logic — per the environment concept
 * board's own "same town, multiple lighting/weather states" pattern, and per
 * the design document's "World Regeneration" chapter-state table.
 */
export interface LegacyMapScene {
  id: string; // e.g. "cape-coast-market"
  label: string;
  tileSizePx: typeof TILE_SIZE_PX;
  widthTiles: number;
  heightTiles: number;
  layers: LegacyMapLayer[];
  collision: LegacyCollisionShape[];
  interactionPoints: LegacyInteractionPoint[];
  npcSpawns: LegacyNpcSpawn[];
  /** Scene-owned roster. When present, only these definitions may spawn here. */
  npcDefinitions?: NPCDefinition[];
  /** Optional hostile targets owned by this scene; never inferred from family NPCs. */
  combatEncounters?: LegacyCombatEncounter[];
  worldStateVariant: string; // e.g. "1912-prosperous" | "1920-collapse" | "1948-present"
  lighting: LegacyLightingState;
  weather?: "clear" | "rain" | "fog";
}

/**
 * Enforcement mirrors the character system: any layer or NPC spawn used in a
 * shipped chapter scene must resolve to artTier "handDrawn". This function
 * is meant to run in CI / a pre-build check against the full scene library,
 * not per-frame at runtime.
 */
export function findNonHandDrawnLayers(scene: LegacyMapScene): LegacyMapLayer[] {
  return scene.layers.filter((layer) => layer.artTier !== "handDrawn");
}

export function isSceneReadyForProduction(scene: LegacyMapScene): boolean {
  return findNonHandDrawnLayers(scene).length === 0;
}
