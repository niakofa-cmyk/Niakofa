/**
 * legacy-environment-assets.ts
 *
 * Registry of all 180 extracted environment assets from
 * Niakofa_Environment_Assets_v1 — ground tiles and buildings/structures/props.
 *
 * Convention mirrors the character art registry:
 *  - artTier "handDrawn" = shipped real art
 *  - artTier "placeholder" = CSS-only fallback (no PNG yet)
 *  - Every entry has a unique assetId matching the filename root, and
 *    a `cssColor` fallback so the renderer never shows a broken image.
 *
 * Ground tiles: 48 frames — 8 variants each of grass, dirt, path,
 *   cobblestone, sand, water-edge.
 * Buildings/props: 132 frames — 11 variants each of compound, hut,
 *   trading-house, church, mission-school, colonial-admin, fence, gate,
 *   wall, well, chest, market-stall.
 *
 * Atlases (reference only — not loaded at runtime):
 *   public/legacy-reference-docs/NIAKOFA-GROUND-TILES-ATLAS-v1.png
 *   public/legacy-reference-docs/NIAKOFA-BUILDINGS-STRUCTURES-ATLAS-v1.png
 */

export type EnvAssetKind =
  | "ground"
  | "building"
  | "structure"
  | "prop";

export type EnvArtTier = "handDrawn" | "placeholder";

export interface LegacyEnvAsset {
  assetId: string;
  kind: EnvAssetKind;
  artTier: EnvArtTier;
  /** Public URL path from root (e.g. "/environment-assets/ground-tiles/...") */
  src: string;
  /** CSS fallback color shown while the PNG loads or if artTier="placeholder". */
  cssColor: string;
  /** Pixel dimensions of the source frame (used for aspect-ratio calculation). */
  naturalWidthPx: number;
  naturalHeightPx: number;
  /** True for tiles that seamlessly repeat — background-repeat: repeat. */
  tileable: boolean;
}

const GT = (file: string, color: string): LegacyEnvAsset => ({
  assetId: file.replace(".png", ""),
  kind: "ground",
  artTier: "handDrawn",
  src: `/environment-assets/ground-tiles/${file}`,
  cssColor: color,
  naturalWidthPx: 213,
  naturalHeightPx: 150,
  tileable: true,
});

const BS = (
  file: string,
  kind: EnvAssetKind,
  color: string,
  w: number,
  h: number,
): LegacyEnvAsset => ({
  assetId: file.replace(".png", ""),
  kind,
  artTier: "handDrawn",
  src: `/environment-assets/buildings-structures/${file}`,
  cssColor: color,
  naturalWidthPx: w,
  naturalHeightPx: h,
  tileable: false,
});

// ── Ground tiles (48) ────────────────────────────────────────────────────────

export const GROUND_GRASS: LegacyEnvAsset[] = Array.from({ length: 8 }, (_, i) =>
  GT(`ground-grass-0${i + 1}.png`, "#2f4a1e"),
);

export const GROUND_DIRT: LegacyEnvAsset[] = Array.from({ length: 8 }, (_, i) =>
  GT(`ground-dirt-0${i + 1}.png`, "#7a4a26"),
);

export const GROUND_PATH: LegacyEnvAsset[] = Array.from({ length: 8 }, (_, i) =>
  GT(`ground-path-0${i + 1}.png`, "#8a6a3a"),
);

export const GROUND_COBBLE: LegacyEnvAsset[] = Array.from({ length: 8 }, (_, i) =>
  GT(`ground-cobble-0${i + 1}.png`, "#6e6259"),
);

export const GROUND_SAND: LegacyEnvAsset[] = Array.from({ length: 8 }, (_, i) =>
  GT(`ground-sand-0${i + 1}.png`, "#c7ad7a"),
);

export const WATER_EDGE: LegacyEnvAsset[] = Array.from({ length: 8 }, (_, i) =>
  GT(`water-edge-0${i + 1}.png`, "#1c3a52"),
);

// ── Buildings (66 — 6 categories × 11 variants) ──────────────────────────────

export const BUILDING_COMPOUND: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`building-compound-0${i + 1}.png`, "building", "#4a3624", 219, 160)),
  BS("building-compound-10.png", "building", "#4a3624", 219, 160),
  BS("building-compound-11.png", "building", "#4a3624", 219, 160),
];

export const BUILDING_HUT: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`building-hut-0${i + 1}.png`, "building", "#6b5024", 219, 140)),
  BS("building-hut-10.png", "building", "#6b5024", 219, 140),
  BS("building-hut-11.png", "building", "#6b5024", 219, 140),
];

export const BUILDING_TRADING_HOUSE: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`building-trading-house-0${i + 1}.png`, "building", "#5a3e20", 219, 155)),
  BS("building-trading-house-10.png", "building", "#5a3e20", 219, 155),
  BS("building-trading-house-11.png", "building", "#5a3e20", 219, 155),
];

export const BUILDING_CHURCH: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`building-church-0${i + 1}.png`, "building", "#8a8070", 219, 170)),
  BS("building-church-10.png", "building", "#8a8070", 219, 170),
  BS("building-church-11.png", "building", "#8a8070", 219, 170),
];

export const BUILDING_MISSION_SCHOOL: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`building-mission-school-0${i + 1}.png`, "building", "#a09080", 219, 120)),
  BS("building-mission-school-10.png", "building", "#a09080", 219, 120),
  BS("building-mission-school-11.png", "building", "#a09080", 219, 120),
];

export const BUILDING_COLONIAL_ADMIN: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`building-colonial-admin-0${i + 1}.png`, "building", "#b8a89a", 219, 160)),
  BS("building-colonial-admin-10.png", "building", "#b8a89a", 219, 160),
  BS("building-colonial-admin-11.png", "building", "#b8a89a", 219, 160),
];

// ── Structures (33 — 3 categories × 11 variants) ─────────────────────────────

export const STRUCTURE_FENCE: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`structure-fence-0${i + 1}.png`, "structure", "#5a4530", 219, 76)),
  BS("structure-fence-10.png", "structure", "#5a4530", 219, 76),
  BS("structure-fence-11.png", "structure", "#5a4530", 219, 76),
];

export const STRUCTURE_GATE: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`structure-gate-0${i + 1}.png`, "structure", "#5a4022", 219, 100)),
  BS("structure-gate-10.png", "structure", "#5a4022", 219, 100),
  BS("structure-gate-11.png", "structure", "#5a4022", 219, 100),
];

export const STRUCTURE_WALL: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`structure-wall-0${i + 1}.png`, "structure", "#7a5a40", 219, 76)),
  BS("structure-wall-10.png", "structure", "#7a5a40", 219, 76),
  BS("structure-wall-11.png", "structure", "#7a5a40", 219, 76),
];

// ── Props (33 — 3 categories × 11 variants) ──────────────────────────────────

export const PROP_WELL: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`prop-well-0${i + 1}.png`, "prop", "#5a4a30", 219, 120)),
  BS("prop-well-10.png", "prop", "#5a4a30", 219, 120),
  BS("prop-well-11.png", "prop", "#5a4a30", 219, 120),
];

export const PROP_CHEST: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`prop-chest-0${i + 1}.png`, "prop", "#7a5030", 219, 100)),
  BS("prop-chest-10.png", "prop", "#7a5030", 219, 100),
  BS("prop-chest-11.png", "prop", "#7a5030", 219, 100),
];

export const PROP_MARKET_STALL: LegacyEnvAsset[] = [
  ...Array.from({ length: 9 }, (_, i) =>
    BS(`prop-market-stall-0${i + 1}.png`, "prop", "#8a5a2a", 219, 130)),
  BS("prop-market-stall-10.png", "prop", "#8a5a2a", 219, 130),
  BS("prop-market-stall-11.png", "prop", "#8a5a2a", 219, 130),
];

// ── Master registry & lookup ──────────────────────────────────────────────────

export const ALL_ENV_ASSETS: LegacyEnvAsset[] = [
  ...GROUND_GRASS,
  ...GROUND_DIRT,
  ...GROUND_PATH,
  ...GROUND_COBBLE,
  ...GROUND_SAND,
  ...WATER_EDGE,
  ...BUILDING_COMPOUND,
  ...BUILDING_HUT,
  ...BUILDING_TRADING_HOUSE,
  ...BUILDING_CHURCH,
  ...BUILDING_MISSION_SCHOOL,
  ...BUILDING_COLONIAL_ADMIN,
  ...STRUCTURE_FENCE,
  ...STRUCTURE_GATE,
  ...STRUCTURE_WALL,
  ...PROP_WELL,
  ...PROP_CHEST,
  ...PROP_MARKET_STALL,
];

const _INDEX = new Map<string, LegacyEnvAsset>(
  ALL_ENV_ASSETS.map((a) => [a.assetId, a]),
);

/**
 * Look up an environment asset by ID (e.g. "ground-grass-03").
 * Returns undefined if the ID is not in the registry.
 */
export function getEnvAsset(assetId: string): LegacyEnvAsset | undefined {
  return _INDEX.get(assetId);
}

/**
 * Returns all assets for a given category prefix (e.g. "ground-grass").
 * Useful for picking a random variant within a category.
 */
export function getEnvAssetVariants(category: string): LegacyEnvAsset[] {
  return ALL_ENV_ASSETS.filter((a) => a.assetId.startsWith(category));
}

// ── LegacyWorldTile → real PNG mapping ───────────────────────────────────────
// Maps the string tile types from legacy-world-layout.ts and
// legacy-dynamic-world-layout.ts to a real PNG asset from this pack.
// Tiles with no direct match (tree_canopy, baobab_trunk) still use a CSS
// color — those categories aren't in this asset pack yet.

export type LegacyWorldTileId =
  | "grass_01" | "grass_02" | "dirt_path" | "red_earth"
  | "water" | "sand" | "compound_wall" | "thatch_roof"
  | "tree_canopy" | "baobab_trunk" | "market_stall" | "fence" | "cocoa_row"
  | "cobblestone"; // extension for future Cape Coast market scenes

export interface TileVisual {
  /** If set, renders as <img> (real art). Otherwise uses cssColor. */
  assetId?: string;
  /** CSS fallback — always present. */
  cssColor: string;
}

/** Deterministic variant selection — given tile type + grid position, returns
 *  a visual variant (1-8) that is stable across renders and gives natural
 *  texture variation without randomness at runtime. */
export function tileVariant(type: LegacyWorldTileId, row: number, col: number): number {
  // Simple hash — stable, deterministic, spreads 1-8
  const h = ((row * 17) ^ (col * 31) ^ type.charCodeAt(0)) & 0xff;
  return (h % 8) + 1;
}

export const WORLD_TILE_VISUAL: Record<LegacyWorldTileId, (row: number, col: number) => TileVisual> = {
  grass_01:     (r, c) => ({ assetId: `ground-grass-0${tileVariant("grass_01", r, c)}`, cssColor: "#2f4a1e" }),
  grass_02:     (r, c) => ({ assetId: `ground-grass-0${((tileVariant("grass_02", r, c) + 3) % 8) + 1}`, cssColor: "#35521f" }),
  dirt_path:    (r, c) => ({ assetId: `ground-path-0${tileVariant("dirt_path", r, c)}`, cssColor: "#8a6a3a" }),
  red_earth:    (r, c) => ({ assetId: `ground-dirt-0${tileVariant("red_earth", r, c)}`, cssColor: "#7a4a26" }),
  sand:         (r, c) => ({ assetId: `ground-sand-0${tileVariant("sand", r, c)}`, cssColor: "#c7ad7a" }),
  cobblestone:  (r, c) => ({ assetId: `ground-cobble-0${tileVariant("cobblestone", r, c)}`, cssColor: "#6e6259" }),
  water:        (r, c) => ({ assetId: `water-edge-0${tileVariant("water", r, c)}`, cssColor: "#1c3a52" }),
  compound_wall:(r, c) => ({ assetId: `structure-wall-0${tileVariant("compound_wall", r, c)}`, cssColor: "#4a3624" }),
  fence:        (r, c) => ({ assetId: `structure-fence-0${tileVariant("fence", r, c)}`, cssColor: "#5a4530" }),
  market_stall: (r, c) => ({ assetId: `prop-market-stall-0${tileVariant("market_stall", r, c)}`, cssColor: "#8a5a2a" }),
  thatch_roof:  (r, c) => ({ assetId: `building-hut-0${tileVariant("thatch_roof", r, c)}`, cssColor: "#6b5024" }),
  // No PNG yet for these — CSS fallback only
  tree_canopy:  () => ({ cssColor: "#16240f" }),
  baobab_trunk: () => ({ cssColor: "#5a3d1f" }),
  cocoa_row:    (r, c) => ({ assetId: `ground-dirt-0${((tileVariant("cocoa_row", r, c) + 2) % 8) + 1}`, cssColor: "#3a2a14" }),
};
