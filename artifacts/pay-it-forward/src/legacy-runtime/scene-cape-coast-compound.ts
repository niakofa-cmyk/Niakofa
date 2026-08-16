/**
 * A real, concrete LegacyMapScene -- not a type example. Built from the
 * actual filenames extracted in Niakofa_Environment_Assets_v1.zip. This is
 * the "hand-author the first real scene" step from
 * ATLAS_INTEGRATION_GUIDE.md / RUNTIME_ARCHITECTURE_UPDATE.md rollout step 2.
 *
 * Copy Niakofa_Environment_Assets_v1's extracted/ folder to
 * `/legacy-character-assets/hand-drawn/environment/` (matching
 * environmentBaseUrl below) before this scene will render anything.
 */

import type { LegacyMapScene } from "./legacy-map-engine";
import type { EnvironmentManifestEntry } from "./legacy-asset-loader";

export const environmentBaseUrl = "/legacy-character-assets/hand-drawn/environment/";

export const capeCoastCompoundAssets: EnvironmentManifestEntry[] = [
  { assetId: "ground-grass-01", file: "ground-tiles/ground-grass-01.png" },
  { assetId: "ground-grass-03", file: "ground-tiles/ground-grass-03.png" },
  { assetId: "ground-path-02", file: "ground-tiles/ground-path-02.png" },
  { assetId: "building-compound-01", file: "buildings-structures/building-compound-01.png" },
  { assetId: "structure-fence-01", file: "buildings-structures/structure-fence-01.png" },
  { assetId: "prop-well-01", file: "buildings-structures/prop-well-01.png" },
];

export const capeCoastCompoundScene: LegacyMapScene = {
  id: "cape-coast-compound",
  label: "Mensah Family Compound",
  tileSizePx: 64,
  widthTiles: 14,
  heightTiles: 10,
  worldStateVariant: "1912-prosperous",
  lighting: "afternoon",
  layers: [
    // ground fills the whole scene first
    { kind: "ground", assetId: "ground-grass-01", artTier: "handDrawn", x: 0, y: 0, widthTiles: 14, heightTiles: 10 },
    // a path from the gate to the compound door
    { kind: "ground", assetId: "ground-path-02", artTier: "handDrawn", x: 6, y: 6, widthTiles: 2, heightTiles: 4 },
    // the compound itself, centered
    { kind: "building", assetId: "building-compound-01", artTier: "handDrawn", x: 7, y: 4 },
    // fence perimeter (a few segments -- full perimeter needs more placements, this is a minimal example)
    { kind: "building", assetId: "structure-fence-01", artTier: "handDrawn", x: 4, y: 8 },
    { kind: "building", assetId: "structure-fence-01", artTier: "handDrawn", x: 10, y: 8 },
    // a well prop in the yard
    { kind: "prop", assetId: "prop-well-01", artTier: "handDrawn", x: 4, y: 5 },
  ],
  collision: [
    { x: 6, y: 3, widthTiles: 4, heightTiles: 3, solid: true }, // compound footprint blocks movement
    { x: 3, y: 4, widthTiles: 1, heightTiles: 1, solid: true },  // well
  ],
  interactionPoints: [
    { id: "compound-door", x: 7, y: 6, triggers: { type: "dialogue", nodeId: "kwame-enters-compound" } },
    { id: "well", x: 4, y: 5, triggers: { type: "vaultArtifact", artifactId: "family-well-memory" } },
  ],
  npcSpawns: [
    { characterId: "ama-serwaa", role: "namedNPC", x: 8, y: 5, facing: "down" },
  ],
};
