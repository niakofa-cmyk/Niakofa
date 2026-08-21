/**
 * Cape Coast Compound — Mensah Family Home, 1890s.
 *
 * Uses real hand-drawn environment art from:
 *   public/environment-assets/ground-tiles/        (48 frames)
 *   public/environment-assets/buildings-structures/ (132 frames)
 *
 * Fixed Aug 2026: environmentBaseUrl was pointing to a non-existent
 * /legacy-character-assets/hand-drawn/environment/ path. Real assets live
 * at /environment-assets/ — corrected here.
 *
 * Scene layout (14 × 10 tiles, 64 px/tile = 896 × 640 px world):
 *
 *   ┌──────────────────────────────┐
 *   │ grass  grass  grass  grass  … │  row 0–2  — open yard / approach
 *   │ grass  grass  compound  …    │  row 3–5  — compound building
 *   │ path   path   gate-fence …  │  row 6–7  — entrance path + fence line
 *   │ grass  well   grass  fence  │  row 5     — yard features
 *   │ fence  fence  fence  fence  │  row 8–9  — south perimeter
 *   └──────────────────────────────┘
 *
 * Grass variant 03 is used for a second section to break up tiling repetition.
 */

import type { LegacyMapScene } from "../lib/legacy-map-engine";
import type { EnvironmentManifestEntry } from "./legacy-asset-loader";

/** Corrected base URL — matches public/environment-assets/ in the Vite static root. */
export const environmentBaseUrl = "/environment-assets/";

/** Every PNG needed by this scene, resolved relative to environmentBaseUrl. */
export const capeCoastCompoundAssets: EnvironmentManifestEntry[] = [
  // Ground variants — two grass variants break up visual repetition
  { assetId: "ground-grass-01", file: "ground-tiles/ground-grass-01.png" },
  { assetId: "ground-grass-03", file: "ground-tiles/ground-grass-03.png" },
  { assetId: "ground-path-02", file: "ground-tiles/ground-path-02.png" },
  // Structures
  { assetId: "building-compound-01", file: "buildings-structures/building-compound-01.png" },
  { assetId: "structure-fence-01",   file: "buildings-structures/structure-fence-01.png"   },
  { assetId: "prop-well-01",         file: "buildings-structures/prop-well-01.png"          },
];

export const capeCoastCompoundScene: LegacyMapScene = {
  id: "cape-coast-compound",
  label: "Mensah Family Compound · Cape Coast, 1890",
  tileSizePx: 64,
  widthTiles: 14,
  heightTiles: 10,
  worldStateVariant: "1890-prosperous",
  lighting: "afternoon",
  layers: [
    // ── Ground ── two grass variants to reduce visible tiling ──────────────
    // North half (rows 0–4) — main grass variant
    { kind: "ground", assetId: "ground-grass-01", artTier: "handDrawn", x: 0, y: 0, widthTiles: 14, heightTiles: 5 },
    // South half (rows 5–9) — alternate grass variant for natural texture break
    { kind: "ground", assetId: "ground-grass-03", artTier: "handDrawn", x: 0, y: 5, widthTiles: 14, heightTiles: 5 },
    // Central path from south entrance to compound door (col 6–7, rows 6–9)
    { kind: "ground", assetId: "ground-path-02",  artTier: "handDrawn", x: 6, y: 6, widthTiles: 2, heightTiles: 4 },

    // ── Buildings ──────────────────────────────────────────────────────────
    // Main compound — feet anchor at tile (7, 4)
    { kind: "building", assetId: "building-compound-01", artTier: "handDrawn", x: 7, y: 4 },

    // ── Structures (fence perimeter along south edge) ──────────────────────
    { kind: "structure", assetId: "structure-fence-01", artTier: "handDrawn", x: 2,  y: 9 },
    { kind: "structure", assetId: "structure-fence-01", artTier: "handDrawn", x: 4,  y: 9 },
    { kind: "structure", assetId: "structure-fence-01", artTier: "handDrawn", x: 6,  y: 9 },
    { kind: "structure", assetId: "structure-fence-01", artTier: "handDrawn", x: 8,  y: 9 },
    { kind: "structure", assetId: "structure-fence-01", artTier: "handDrawn", x: 10, y: 9 },
    { kind: "structure", assetId: "structure-fence-01", artTier: "handDrawn", x: 12, y: 9 },

    // ── Props ──────────────────────────────────────────────────────────────
    // Well in the yard — interactable
    { kind: "prop", assetId: "prop-well-01", artTier: "handDrawn", x: 3, y: 5 },
  ],

  collision: [
    // Compound building footprint (blocks movement through the walls)
    { x: 5, y: 2, widthTiles: 5, heightTiles: 3, solid: true },
    // Well (single tile)
    { x: 3, y: 5, widthTiles: 1, heightTiles: 1, solid: true },
    // South fence line
    { x: 0, y: 9, widthTiles: 14, heightTiles: 1, solid: true },
  ],

  interactionPoints: [
    { id: "compound-door", x: 7, y: 5, triggers: { type: "dialogue",      nodeId: "kwame-enters-compound"    } },
    { id: "well",          x: 3, y: 5, triggers: { type: "vaultArtifact", artifactId: "family-well-memory" } },
  ],

  npcSpawns: [
    // Ama Serwaa tends to the yard near the compound entrance
    { characterId: "ama-serwaa", role: "namedNPC", x: 9, y: 5, facing: "down" },
  ],
};
