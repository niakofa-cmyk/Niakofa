/**
 * legacy-map-scenes.ts
 *
 * Hand-authored LegacyMapScene definitions — the first real playable locations
 * for the Niakofa Legacy RPG, using the v1 environment asset pack.
 *
 * Scenes use the 64×64px tile grid defined in legacy-map-engine.ts.
 * Asset IDs reference legacy-environment-assets.ts entries.
 *
 * World-state variants:
 *   "1890s-prosperous" — early Cape Coast, the Mensah family at their peak
 *   "1912-prosperous"  — Kumasi market expansion
 *   "1920-collapse"    — post-WWI economic decline (same locations, different
 *                        assets when we have collapsed variants)
 *   "1930-migration"   — Liverpool arrival
 *   "1945-diaspora"    — Chicago establishment
 */

import type { LegacyMapScene } from "./legacy-map-engine";
import { TILE_SIZE_PX } from "./legacy-map-engine";

// ── Scene 1: Cape Coast Compound (1890s) ─────────────────────────────────────
// The Mensah family compound — where Kwame grows up. Ground: mixed grass +
// dirt courtyard. Buildings: main compound, 2 huts. Structures: fence
// boundary + gate. Props: well in the yard, chest in the store room.

export const SCENE_CAPE_COAST_COMPOUND_1890: LegacyMapScene = {
  id: "cape-coast-compound-1890",
  label: "Mensah Compound · Cape Coast · 1890s",
  tileSizePx: TILE_SIZE_PX,
  widthTiles: 12,
  heightTiles: 10,
  worldStateVariant: "1890s-prosperous",
  lighting: "afternoon",
  weather: "clear",

  layers: [
    // ── Ground layer: grass perimeter + dirt courtyard interior ──────────────
    // Row 0 (top border)
    ...Array.from({ length: 12 }, (_, c) => ({
      kind: "ground" as const, artTier: "handDrawn" as const,
      assetId: `ground-grass-0${(c % 8) + 1}`, x: c, y: 0,
    })),
    // Rows 1-8: perimeter grass, dirt interior
    ...Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 12 }, (_, c) => ({
        kind: "ground" as const, artTier: "handDrawn" as const,
        assetId: (c === 0 || c === 11 || r < 1 || r > 6)
          ? `ground-grass-0${((r * 3 + c) % 8) + 1}`
          : `ground-dirt-0${((r * 5 + c * 2) % 8) + 1}`,
        x: c, y: r + 1,
      }))
    ).flat(),
    // Row 9 (bottom border)
    ...Array.from({ length: 12 }, (_, c) => ({
      kind: "ground" as const, artTier: "handDrawn" as const,
      assetId: `ground-path-0${(c % 8) + 1}`, x: c, y: 9,
    })),

    // ── Path from gate to main compound ──────────────────────────────────────
    { kind: "ground", artTier: "handDrawn", assetId: "ground-path-03", x: 5, y: 5 },
    { kind: "ground", artTier: "handDrawn", assetId: "ground-path-04", x: 5, y: 4 },
    { kind: "ground", artTier: "handDrawn", assetId: "ground-path-05", x: 5, y: 3 },
    { kind: "ground", artTier: "handDrawn", assetId: "ground-path-06", x: 6, y: 3 },
    { kind: "ground", artTier: "handDrawn", assetId: "ground-path-07", x: 6, y: 2 },

    // ── Building: main Mensah compound (3×2 tiles, top-left at x=3,y=1) ─────
    {
      kind: "building", artTier: "handDrawn",
      assetId: "building-compound-03",
      x: 3, y: 1, widthTiles: 4, heightTiles: 2,
    },

    // ── Building: family hut (east side, 2×1) ────────────────────────────────
    {
      kind: "building", artTier: "handDrawn",
      assetId: "building-hut-05",
      x: 8, y: 2, widthTiles: 2, heightTiles: 1,
    },

    // ── Building: store-room hut (west side, 2×1) ────────────────────────────
    {
      kind: "building", artTier: "handDrawn",
      assetId: "building-hut-02",
      x: 1, y: 2, widthTiles: 2, heightTiles: 1,
    },

    // ── Structure: compound boundary fence ───────────────────────────────────
    ...Array.from({ length: 10 }, (_, c) => ({
      kind: "structure" as const, artTier: "handDrawn" as const,
      assetId: `structure-fence-0${(c % 8) + 1}`, x: c + 1, y: 1,
    })),
    ...Array.from({ length: 10 }, (_, c) => ({
      kind: "structure" as const, artTier: "handDrawn" as const,
      assetId: `structure-fence-0${((c + 4) % 8) + 1}`, x: c + 1, y: 7,
    })),

    // ── Structure: compound gate (south entrance) ─────────────────────────────
    {
      kind: "structure", artTier: "handDrawn",
      assetId: "structure-gate-04",
      x: 5, y: 7, widthTiles: 2, heightTiles: 1,
    },

    // ── Prop: well in centre of courtyard ────────────────────────────────────
    {
      kind: "prop", artTier: "handDrawn",
      assetId: "prop-well-03",
      x: 7, y: 5,
    },

    // ── Prop: trading chest near store-room ──────────────────────────────────
    {
      kind: "prop", artTier: "handDrawn",
      assetId: "prop-chest-02",
      x: 2, y: 3,
    },
  ],

  collision: [
    // Main compound building footprint
    { x: 3, y: 1, widthTiles: 4, heightTiles: 2, solid: true },
    // East hut
    { x: 8, y: 2, widthTiles: 2, heightTiles: 1, solid: true },
    // West hut
    { x: 1, y: 2, widthTiles: 2, heightTiles: 1, solid: true },
    // North fence
    { x: 1, y: 1, widthTiles: 10, heightTiles: 1, solid: true },
    // South fence (with gap at gate)
    { x: 1, y: 7, widthTiles: 4, heightTiles: 1, solid: true },
    { x: 7, y: 7, widthTiles: 4, heightTiles: 1, solid: true },
    // Well — interact, don't block fully
    { x: 7, y: 5, widthTiles: 1, heightTiles: 1, solid: false },
    // Chest — interact
    { x: 2, y: 3, widthTiles: 1, heightTiles: 1, solid: false },
  ],

  interactionPoints: [
    {
      id: "well-mensah-1890",
      x: 7, y: 5,
      triggers: { type: "dialogue", nodeId: "mensah-well-intro" },
    },
    {
      id: "chest-mensah-1890",
      x: 2, y: 3,
      triggers: { type: "vaultArtifact", artifactId: "mensah-trade-ledger-1890" },
    },
    {
      id: "compound-door-1890",
      x: 5, y: 3,
      triggers: { type: "dialogue", nodeId: "mensah-compound-morning" },
    },
  ],

  npcSpawns: [
    { characterId: "kwame-mensah", role: "protagonist", x: 5, y: 6, facing: "up" },
    { characterId: "abena-mensah", role: "namedNPC", x: 7, y: 4, facing: "down" },
  ],
};

// ── Scene 2: Cape Coast Market Street (1905) ─────────────────────────────────
// The market district where the House of Mensah Trading Company operates.
// Ground: cobblestone main street + dirt side lanes. Buildings: trading house.
// Props: 4 market stalls along the main road.

export const SCENE_CAPE_COAST_MARKET_1905: LegacyMapScene = {
  id: "cape-coast-market-1905",
  label: "Cape Coast Market Street · 1905",
  tileSizePx: TILE_SIZE_PX,
  widthTiles: 14,
  heightTiles: 8,
  worldStateVariant: "1905-prosperous",
  lighting: "morning",
  weather: "clear",

  layers: [
    // Dirt background
    ...Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 14 }, (_, c) => ({
        kind: "ground" as const, artTier: "handDrawn" as const,
        assetId: `ground-dirt-0${((r * 7 + c * 3) % 8) + 1}`, x: c, y: r,
      }))
    ).flat(),
    // Cobblestone main street rows 3-4
    ...Array.from({ length: 14 }, (_, c) => ({
      kind: "ground" as const, artTier: "handDrawn" as const,
      assetId: `ground-cobble-0${(c % 8) + 1}`, x: c, y: 3,
    })),
    ...Array.from({ length: 14 }, (_, c) => ({
      kind: "ground" as const, artTier: "handDrawn" as const,
      assetId: `ground-cobble-0${((c + 4) % 8) + 1}`, x: c, y: 4,
    })),
    // Sandy edges
    ...Array.from({ length: 14 }, (_, c) => ({
      kind: "ground" as const, artTier: "handDrawn" as const,
      assetId: `ground-sand-0${(c % 8) + 1}`, x: c, y: 0,
    })),

    // Trading House (House of Mensah) — north side of street
    {
      kind: "building", artTier: "handDrawn",
      assetId: "building-trading-house-04",
      x: 2, y: 0, widthTiles: 4, heightTiles: 3,
    },

    // Colonial Administration building — east end
    {
      kind: "building", artTier: "handDrawn",
      assetId: "building-colonial-admin-02",
      x: 9, y: 0, widthTiles: 4, heightTiles: 3,
    },

    // Market stalls along the south side of the street
    { kind: "prop", artTier: "handDrawn", assetId: "prop-market-stall-05", x: 1, y: 5 },
    { kind: "prop", artTier: "handDrawn", assetId: "prop-market-stall-08", x: 4, y: 5 },
    { kind: "prop", artTier: "handDrawn", assetId: "prop-market-stall-02", x: 7, y: 5 },
    { kind: "prop", artTier: "handDrawn", assetId: "prop-market-stall-10", x: 10, y: 5 },

    // Gate at west entrance to market
    { kind: "structure", artTier: "handDrawn", assetId: "structure-gate-07", x: 0, y: 3 },
  ],

  collision: [
    { x: 2, y: 0, widthTiles: 4, heightTiles: 3, solid: true },
    { x: 9, y: 0, widthTiles: 4, heightTiles: 3, solid: true },
    { x: 1, y: 5, widthTiles: 1, heightTiles: 1, solid: false },
    { x: 4, y: 5, widthTiles: 1, heightTiles: 1, solid: false },
    { x: 7, y: 5, widthTiles: 1, heightTiles: 1, solid: false },
    { x: 10, y: 5, widthTiles: 1, heightTiles: 1, solid: false },
  ],

  interactionPoints: [
    {
      id: "trading-house-door-1905",
      x: 3, y: 2,
      triggers: { type: "dialogue", nodeId: "mensah-trading-house-open" },
    },
    {
      id: "market-stall-north-1905",
      x: 4, y: 5,
      triggers: { type: "questStep", questId: "house-of-mensah-founding", stepId: "first-sale" },
    },
    {
      id: "colonial-admin-door-1905",
      x: 10, y: 2,
      triggers: { type: "dialogue", nodeId: "colonial-office-intro" },
    },
  ],

  npcSpawns: [
    { characterId: "kwame-mensah", role: "protagonist", x: 5, y: 4, facing: "right" },
    { characterId: "colonial-officer", role: "antagonist", x: 11, y: 3, facing: "left" },
  ],
};

// ── Scene 3: Cape Coast Water's Edge (1912) ───────────────────────────────────
// The harbour approach where the Mensah family witnesses the colonial ships.
// Ground: sand coast + water edge. Buildings: church (coastal mission).

export const SCENE_CAPE_COAST_HARBOUR_1912: LegacyMapScene = {
  id: "cape-coast-harbour-1912",
  label: "Cape Coast Harbour · 1912",
  tileSizePx: TILE_SIZE_PX,
  widthTiles: 12,
  heightTiles: 6,
  worldStateVariant: "1912-prosperous",
  lighting: "morning",
  weather: "clear",

  layers: [
    // Water-edge at bottom 2 rows
    ...Array.from({ length: 2 }, (_, r) =>
      Array.from({ length: 12 }, (_, c) => ({
        kind: "ground" as const, artTier: "handDrawn" as const,
        assetId: `water-edge-0${(c % 8) + 1}`, x: c, y: r + 4,
      }))
    ).flat(),
    // Sandy shore
    ...Array.from({ length: 12 }, (_, c) => ({
      kind: "ground" as const, artTier: "handDrawn" as const,
      assetId: `ground-sand-0${(c % 8) + 1}`, x: c, y: 3,
    })),
    // Grass inland rows
    ...Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 12 }, (_, c) => ({
        kind: "ground" as const, artTier: "handDrawn" as const,
        assetId: `ground-grass-0${((r * 4 + c) % 8) + 1}`, x: c, y: r,
      }))
    ).flat(),
    // Cobblestone path to harbour
    { kind: "ground", artTier: "handDrawn", assetId: "ground-cobble-03", x: 5, y: 3 },
    { kind: "ground", artTier: "handDrawn", assetId: "ground-cobble-05", x: 5, y: 2 },
    { kind: "ground", artTier: "handDrawn", assetId: "ground-cobble-07", x: 5, y: 1 },

    // Church (coastal mission)
    {
      kind: "building", artTier: "handDrawn",
      assetId: "building-church-06",
      x: 1, y: 0, widthTiles: 3, heightTiles: 2,
    },

    // Fence along shore
    ...Array.from({ length: 10 }, (_, c) => ({
      kind: "structure" as const, artTier: "handDrawn" as const,
      assetId: `structure-fence-0${(c % 8) + 1}`, x: c + 1, y: 3,
    })),
  ],

  collision: [
    { x: 1, y: 0, widthTiles: 3, heightTiles: 2, solid: true },
    { x: 0, y: 4, widthTiles: 12, heightTiles: 2, solid: true }, // water
    { x: 1, y: 3, widthTiles: 4, heightTiles: 1, solid: true }, // fence
    { x: 6, y: 3, widthTiles: 5, heightTiles: 1, solid: true },
  ],

  interactionPoints: [
    {
      id: "church-door-1912",
      x: 2, y: 1,
      triggers: { type: "dialogue", nodeId: "mission-church-encounter" },
    },
    {
      id: "harbour-water-1912",
      x: 5, y: 4,
      triggers: { type: "worldEvolutionReveal", eventId: "colonial-ships-1912" },
    },
  ],

  npcSpawns: [
    { characterId: "kwame-mensah", role: "protagonist", x: 5, y: 2, facing: "down" },
  ],
};

// ── Scene registry ────────────────────────────────────────────────────────────

export const ALL_MAP_SCENES: LegacyMapScene[] = [
  SCENE_CAPE_COAST_COMPOUND_1890,
  SCENE_CAPE_COAST_MARKET_1905,
  SCENE_CAPE_COAST_HARBOUR_1912,
];

export function getMapScene(id: string): LegacyMapScene | undefined {
  return ALL_MAP_SCENES.find((s) => s.id === id);
}
