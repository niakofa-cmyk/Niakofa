/**
 * Mensah Compound — Cape Coast · 1890.
 *
 * The first production Legacy region, aligned to the supplied 19-location
 * compound board. Runtime art is the measured, hand-drawn extraction under
 * public/environment-assets; the uploaded atlases remain reference material.
 */

import type { LegacyMapScene } from "../lib/legacy-map-engine";
import type { EnvironmentManifestEntry } from "./legacy-asset-loader";
import { MENSAH_COMPOUND_NPCS } from "./mensah-compound-npcs";

export const mensahCompoundBaseUrl = "/environment-assets/";

export const mensahCompoundAssets: EnvironmentManifestEntry[] = [
  { assetId: "ground-grass-01", file: "ground-tiles-runtime/ground-grass-01.png" },
  { assetId: "ground-grass-03", file: "ground-tiles-runtime/ground-grass-03.png" },
  { assetId: "ground-grass-05", file: "ground-tiles-runtime/ground-grass-05.png" },
  { assetId: "ground-path-02", file: "ground-tiles-runtime/ground-path-02.png" },
  { assetId: "ground-path-04", file: "ground-tiles-runtime/ground-path-04.png" },
  { assetId: "ground-sand-01", file: "ground-tiles-runtime/ground-sand-01.png" },
  { assetId: "ground-sand-03", file: "ground-tiles-runtime/ground-sand-03.png" },
  { assetId: "building-compound-01", file: "buildings-structures/building-compound-01.png" },
  { assetId: "building-compound-02", file: "buildings-structures/building-compound-02.png" },
  { assetId: "building-compound-03", file: "buildings-structures/building-compound-03.png" },
  { assetId: "building-hut-01", file: "buildings-structures/building-hut-01.png" },
  { assetId: "building-hut-02", file: "buildings-structures/building-hut-02.png" },
  { assetId: "building-hut-03", file: "buildings-structures/building-hut-03.png" },
  { assetId: "building-hut-04", file: "buildings-structures/building-hut-04.png" },
  { assetId: "prop-well-01", file: "buildings-structures/prop-well-01.png" },
  { assetId: "prop-chest-01", file: "buildings-structures/prop-chest-01.png" },
  { assetId: "prop-market-stall-01", file: "buildings-structures/prop-market-stall-01.png" },
  { assetId: "structure-fence-01", file: "buildings-structures/structure-fence-01.png" },
];

const fence = (x: number, y: number) => ({
  kind: "structure" as const,
  assetId: "structure-fence-01",
  artTier: "handDrawn" as const,
  x,
  y,
});

export const mensahCompoundScene: LegacyMapScene = {
  id: "mensah-compound",
  label: "Mensah Compound · Cape Coast, 1890",
  tileSizePx: 64,
  widthTiles: 32,
  heightTiles: 24,
  worldStateVariant: "1890-prosperous",
  lighting: "afternoon",
  weather: "clear",
  layers: [
    { kind: "ground", assetId: "ground-grass-01", artTier: "handDrawn", x: 0, y: 0, widthTiles: 32, heightTiles: 24 },
    { kind: "ground", assetId: "ground-grass-03", artTier: "handDrawn", x: 0, y: 16, widthTiles: 12, heightTiles: 8 },
    { kind: "ground", assetId: "ground-grass-05", artTier: "handDrawn", x: 20, y: 0, widthTiles: 12, heightTiles: 8 },
    { kind: "ground", assetId: "ground-sand-01", artTier: "handDrawn", x: 10, y: 8, widthTiles: 12, heightTiles: 8 },
    { kind: "ground", assetId: "ground-sand-03", artTier: "handDrawn", x: 12, y: 10, widthTiles: 8, heightTiles: 4 },
    { kind: "ground", assetId: "ground-sand-01", artTier: "handDrawn", x: 2, y: 8, widthTiles: 6, heightTiles: 6 },
    { kind: "ground", assetId: "ground-sand-03", artTier: "handDrawn", x: 2, y: 15, widthTiles: 6, heightTiles: 4 },
    { kind: "ground", assetId: "ground-path-02", artTier: "handDrawn", x: 15, y: 10, widthTiles: 2, heightTiles: 12 },
    { kind: "ground", assetId: "ground-path-04", artTier: "handDrawn", x: 17, y: 6, widthTiles: 5, heightTiles: 1 },
    { kind: "ground", assetId: "ground-path-04", artTier: "handDrawn", x: 20, y: 11, widthTiles: 4, heightTiles: 1 },
    { kind: "ground", assetId: "ground-path-04", artTier: "handDrawn", x: 3, y: 11, widthTiles: 7, heightTiles: 1 },
    { kind: "ground", assetId: "ground-path-04", artTier: "handDrawn", x: 12, y: 14, widthTiles: 3, heightTiles: 1 },

    { kind: "building", assetId: "building-compound-01", artTier: "handDrawn", x: 13, y: 5 },
    { kind: "building", assetId: "building-hut-01", artTier: "handDrawn", x: 22, y: 4 },
    { kind: "building", assetId: "building-hut-02", artTier: "handDrawn", x: 24, y: 9 },
    { kind: "building", assetId: "building-compound-02", artTier: "handDrawn", x: 20, y: 14 },
    { kind: "building", assetId: "building-compound-03", artTier: "handDrawn", x: 11, y: 14 },
    { kind: "building", assetId: "building-hut-03", artTier: "handDrawn", x: 26, y: 15 },
    { kind: "building", assetId: "building-hut-04", artTier: "handDrawn", x: 3, y: 16 },

    { kind: "prop", assetId: "prop-well-01", artTier: "handDrawn", x: 15, y: 11 },
    { kind: "prop", assetId: "prop-chest-01", artTier: "handDrawn", x: 8, y: 9 },
    { kind: "prop", assetId: "prop-market-stall-01", artTier: "handDrawn", x: 19, y: 11 },
    { kind: "prop", assetId: "prop-chest-01", artTier: "handDrawn", x: 15, y: 14 },

    ...[2, 4, 6, 8, 10, 12, 18, 20, 22, 24, 26, 28].map((x) => fence(x, 21)),
    ...[4, 8, 12, 16, 20, 24].map((x) => fence(x, 2)),
    ...[4, 6, 8, 13, 15, 17, 19].map((y) => fence(1, y)),
    ...[4, 6, 8, 10, 12, 14, 16, 18].map((y) => fence(30, y)),
  ],
  collision: [
    { x: 12, y: 4, widthTiles: 6, heightTiles: 4, solid: true },
    { x: 21, y: 3, widthTiles: 3, heightTiles: 3, solid: true },
    { x: 23, y: 8, widthTiles: 3, heightTiles: 3, solid: true },
    { x: 19, y: 13, widthTiles: 4, heightTiles: 3, solid: true },
    { x: 10, y: 13, widthTiles: 4, heightTiles: 3, solid: true },
    { x: 25, y: 14, widthTiles: 3, heightTiles: 3, solid: true },
    { x: 2, y: 15, widthTiles: 3, heightTiles: 2, solid: true },
    { x: 15, y: 11, widthTiles: 1, heightTiles: 1, solid: true },
    { x: 8, y: 9, widthTiles: 1, heightTiles: 1, solid: true },
    { x: 19, y: 11, widthTiles: 2, heightTiles: 1, solid: true },
    { x: 1, y: 21, widthTiles: 14, heightTiles: 1, solid: true },
    { x: 17, y: 21, widthTiles: 13, heightTiles: 1, solid: true },
    { x: 1, y: 2, widthTiles: 1, heightTiles: 8, solid: true },
    { x: 1, y: 13, widthTiles: 1, heightTiles: 8, solid: true },
    { x: 30, y: 2, widthTiles: 1, heightTiles: 19, solid: true },
    { x: 2, y: 2, widthTiles: 28, heightTiles: 1, solid: true },
  ],
  interactionPoints: [
    { id: "main-house", x: 15, y: 8, triggers: { type: "dialogue", nodeId: "enter-mensah-house" } },
    { id: "dining-room", x: 13, y: 6, triggers: { type: "dialogue", nodeId: "dining-memory" } },
    { id: "family-room", x: 15, y: 6, triggers: { type: "dialogue", nodeId: "family-room-talk" } },
    { id: "kitchen", x: 17, y: 6, triggers: { type: "dialogue", nodeId: "kitchen-help" } },
    { id: "storage-room", x: 18, y: 6, triggers: { type: "dialogue", nodeId: "storage-inspect" } },
    { id: "grandma-ama-room", x: 22, y: 6, triggers: { type: "dialogue", nodeId: "visit-ama" } },
    { id: "kwame-room", x: 24, y: 11, triggers: { type: "dialogue", nodeId: "kwame-room-rest" } },
    // Keep the courtyard point distinct from the well. Both used to occupy
    // (15, 12), so nearest-point tie breaking made the well memory
    // unreachable through Space.
    { id: "inner-courtyard", x: 16, y: 13, triggers: { type: "dialogue", nodeId: "courtyard-observe" } },
    { id: "family-shrine", x: 8, y: 10, triggers: { type: "vaultArtifact", artifactId: "family-shrine-memory" } },
    { id: "well", x: 15, y: 12, triggers: { type: "vaultArtifact", artifactId: "family-well-memory" } },
    { id: "cooking-area", x: 19, y: 12, triggers: { type: "dialogue", nodeId: "cooking-fire-talk" } },
    { id: "palm-wine-shed", x: 26, y: 17, triggers: { type: "dialogue", nodeId: "palm-wine-inspect" } },
    { id: "guest-house", x: 20, y: 16, triggers: { type: "dialogue", nodeId: "guest-house-enter" } },
    { id: "workshop", x: 12, y: 16, triggers: { type: "questStep", questId: "compound-chores", stepId: "help-workshop" } },
    { id: "laundry", x: 15, y: 15, triggers: { type: "dialogue", nodeId: "laundry-help" } },
    { id: "animal-pen", x: 4, y: 17, triggers: { type: "questStep", questId: "compound-chores", stepId: "feed-animals" } },
    { id: "garden-plots", x: 4, y: 10, triggers: { type: "questStep", questId: "compound-chores", stepId: "tend-garden" } },
    { id: "back-gate", x: 1, y: 11, triggers: { type: "questStep", questId: "leave-compound", stepId: "to-farm" } },
    { id: "front-gate", x: 15, y: 21, triggers: { type: "questStep", questId: "leave-compound", stepId: "to-street" } },
  ],
  npcSpawns: [
    { characterId: "ama-serwaa", role: "namedNPC", x: 16, y: 9, facing: "down" },
    { characterId: "kwaku-mensah", role: "namedNPC", x: 5, y: 12, facing: "right" },
    { characterId: "efua-cook", role: "namedNPC", x: 20, y: 12, facing: "left" },
    { characterId: "kofi-carpenter", role: "namedNPC", x: 13, y: 15, facing: "down" },
  ],
  npcDefinitions: MENSAH_COMPOUND_NPCS,
  combatEncounters: [
    {
      id: "road-raider-front-gate",
      name: "Road Raider",
      x: 17.5,
      y: 19,
      hp: 64,
      rewardItemId: "front-gate-memory-token",
      rewardQuestId: "mensah-compound-road-encounter",
    },
  ],
};

export const MENSAH_COMPOUND_SPAWN = { x: 15, y: 19, facing: "up" as const };