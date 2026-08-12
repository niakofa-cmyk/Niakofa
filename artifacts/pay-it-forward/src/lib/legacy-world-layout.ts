export type LegacyWorldTile =
  | "grass_01"
  | "grass_02"
  | "dirt_path"
  | "red_earth"
  | "water"
  | "sand"
  | "compound_wall"
  | "thatch_roof"
  | "tree_canopy"
  | "baobab_trunk"
  | "market_stall"
  | "fence"
  | "cocoa_row";

export type LegacyWorldLandmarkIcon = "photo" | "recipe" | "medal" | "certificate";

export interface LegacyWorldLandmark {
  artifactId: string;
  row: number;
  column: number;
  label: string;
  description: string;
  icon: LegacyWorldLandmarkIcon;
}

export interface LegacyWorldLayout {
  map: readonly (readonly LegacyWorldTile[])[];
  landmarks: readonly LegacyWorldLandmark[];
}

export interface LegacyWorldPosition {
  row: number;
  column: number;
}

export const LEGACY_WORLD_BLOCKED_TILES = new Set<LegacyWorldTile>([
  "water",
  "compound_wall",
  "thatch_roof",
  "tree_canopy",
  "baobab_trunk",
  "market_stall",
  "fence",
]);

const ORIGINAL_LAYOUT: LegacyWorldLayout = {
  map: [
    ["tree_canopy", "tree_canopy", "grass_01", "grass_02", "grass_01", "tree_canopy", "grass_01", "grass_02", "tree_canopy"],
    ["tree_canopy", "baobab_trunk", "grass_01", "dirt_path", "dirt_path", "grass_02", "grass_01", "tree_canopy", "tree_canopy"],
    ["grass_02", "compound_wall", "thatch_roof", "dirt_path", "dirt_path", "market_stall", "grass_02", "grass_01", "grass_02"],
    ["grass_01", "fence", "red_earth", "dirt_path", "dirt_path", "cocoa_row", "grass_01", "sand", "sand"],
    ["grass_02", "grass_01", "grass_02", "dirt_path", "water", "water", "dirt_path", "sand", "water"],
    ["grass_01", "grass_02", "red_earth", "dirt_path", "dirt_path", "grass_01", "grass_02", "grass_01", "grass_02"],
  ],
  landmarks: [
    {
      artifactId: "photo",
      row: 1,
      column: 4,
      label: "Portrait wall",
      description: "A newly named ancestor watches over the market road.",
      icon: "photo",
    },
    {
      artifactId: "recipe",
      row: 2,
      column: 3,
      label: "Kitchen hearth",
      description: "Grandma Ama's recipe opens a remembered conversation.",
      icon: "recipe",
    },
    {
      artifactId: "medal",
      row: 3,
      column: 2,
      label: "Service marker",
      description: "A chapter seed marks the soldier's return home.",
      icon: "medal",
    },
    {
      artifactId: "certificate",
      row: 4,
      column: 6,
      label: "Migration route",
      description: "A family branch now connects this path to a new place.",
      icon: "certificate",
    },
  ],
};

const REGENERATED_LAYOUT: LegacyWorldLayout = {
  map: [
    ["tree_canopy", "tree_canopy", "grass_01", "grass_02", "tree_canopy", "grass_01", "grass_02", "tree_canopy", "tree_canopy"],
    ["grass_02", "baobab_trunk", "dirt_path", "dirt_path", "grass_01", "dirt_path", "grass_02", "grass_01", "tree_canopy"],
    ["grass_01", "compound_wall", "thatch_roof", "dirt_path", "market_stall", "dirt_path", "grass_01", "grass_02", "grass_01"],
    ["grass_02", "fence", "red_earth", "dirt_path", "dirt_path", "cocoa_row", "dirt_path", "sand", "sand"],
    ["grass_01", "grass_02", "water", "water", "dirt_path", "grass_01", "dirt_path", "sand", "water"],
    ["grass_02", "grass_01", "red_earth", "dirt_path", "dirt_path", "grass_02", "grass_01", "grass_02", "grass_01"],
  ],
  landmarks: [
    {
      artifactId: "photo",
      row: 1,
      column: 5,
      label: "Portrait wall",
      description: "A newly named ancestor watches over the market road.",
      icon: "photo",
    },
    {
      artifactId: "recipe",
      row: 2,
      column: 4,
      label: "Kitchen hearth",
      description: "Grandma Ama's recipe opens a remembered conversation.",
      icon: "recipe",
    },
    {
      artifactId: "medal",
      row: 3,
      column: 3,
      label: "Service marker",
      description: "A chapter seed marks the soldier's return home.",
      icon: "medal",
    },
    {
      artifactId: "certificate",
      row: 4,
      column: 4,
      label: "Migration route",
      description: "A family branch now connects this path to a new place.",
      icon: "certificate",
    },
  ],
};

export function getLegacyWorldLayout(worldVersion: number): LegacyWorldLayout {
  return worldVersion >= 2 ? REGENERATED_LAYOUT : ORIGINAL_LAYOUT;
}

export function isLegacyWorldPositionWalkable(
  layout: LegacyWorldLayout,
  position: LegacyWorldPosition,
): boolean {
  const tile = layout.map[position.row]?.[position.column];
  return tile !== undefined && !LEGACY_WORLD_BLOCKED_TILES.has(tile);
}

export function getLegacyWorldSpawn(worldVersion: number): LegacyWorldPosition {
  const layout = getLegacyWorldLayout(worldVersion);
  const preferred = { row: 5, column: 3 };
  if (isLegacyWorldPositionWalkable(layout, preferred)) return preferred;

  for (let row = layout.map.length - 1; row >= 0; row -= 1) {
    for (let column = 0; column < (layout.map[row]?.length ?? 0); column += 1) {
      const position = { row, column };
      if (isLegacyWorldPositionWalkable(layout, position)) return position;
    }
  }

  return { row: 0, column: 0 };
}

/**
 * Returns the restored memory at a player's current map position, if any.
 * Keeping this lookup beside the deterministic layout prevents the renderer
 * from duplicating coordinate rules and gives the exploration loop a small,
 * testable contract.
 */
export function getLegacyWorldLandmarkAt(
  layout: LegacyWorldLayout,
  position: LegacyWorldPosition,
): LegacyWorldLandmark | null {
  return layout.landmarks.find(
    (landmark) => landmark.row === position.row && landmark.column === position.column,
  ) ?? null;
}