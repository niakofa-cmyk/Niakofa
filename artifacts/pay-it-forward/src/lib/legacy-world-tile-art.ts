/**
 * Bridges the public living-world grid to the extracted hand-drawn
 * environment registry. The resolver is deterministic so re-renders do not
 * reshuffle neighboring texture variants.
 */

import {
  WORLD_TILE_VISUAL,
  getEnvAsset,
  type LegacyWorldTileId,
} from "./legacy-environment-assets";

const LEGACY_PLACEHOLDER_ROOT = "/legacy-world-assets/tiles";

/** Structure tiles sit on a real ground layer instead of a floating icon. */
const OVERLAY_GROUND_BASE: Partial<Record<LegacyWorldTileId, LegacyWorldTileId>> = {
  thatch_roof: "grass_01",
  market_stall: "dirt_path",
  fence: "grass_01",
  compound_wall: "grass_01",
};

const NO_ART_YET = new Set<LegacyWorldTileId>(["tree_canopy", "baobab_trunk"]);

export interface ResolvedTileArt {
  groundSrc?: string;
  overlaySrc?: string;
  overlayIsStructure: boolean;
  cssColor: string;
  legacyPlaceholderSrc?: string;
}

export function resolveWorldTileArt(
  tile: LegacyWorldTileId,
  row: number,
  column: number,
): ResolvedTileArt {
  if (NO_ART_YET.has(tile)) {
    return {
      overlayIsStructure: false,
      cssColor: WORLD_TILE_VISUAL[tile](row, column).cssColor,
      legacyPlaceholderSrc: `${LEGACY_PLACEHOLDER_ROOT}/${tile}.png`,
    };
  }

  const visual = WORLD_TILE_VISUAL[tile](row, column);
  const groundBaseTile = OVERLAY_GROUND_BASE[tile];

  if (groundBaseTile) {
    const groundVisual = WORLD_TILE_VISUAL[groundBaseTile](row, column);
    const groundAsset = groundVisual.assetId ? getEnvAsset(groundVisual.assetId) : undefined;
    const overlayAsset = visual.assetId ? getEnvAsset(visual.assetId) : undefined;
    return {
      groundSrc: groundAsset?.src,
      overlaySrc: overlayAsset?.src,
      overlayIsStructure: true,
      cssColor: groundVisual.cssColor,
    };
  }

  const groundAsset = visual.assetId ? getEnvAsset(visual.assetId) : undefined;
  return {
    groundSrc: groundAsset?.src,
    overlayIsStructure: false,
    cssColor: visual.cssColor,
  };
}