/**
 * A single live-world grid cell with a hand-drawn ground layer and an
 * optional structure/prop overlay.
 */

import { resolveWorldTileArt } from "@/lib/legacy-world-tile-art";
import type { LegacyWorldTileId } from "@/lib/legacy-environment-assets";

export function LegacyWorldTileCell({
  tile,
  row,
  column,
}: {
  tile: LegacyWorldTileId;
  row: number;
  column: number;
}) {
  const art = resolveWorldTileArt(tile, row, column);

  // Vegetation has no extracted art yet; preserve the existing placeholder
  // sprites until a dedicated foliage sheet is added.
  if (art.legacyPlaceholderSrc) {
    return (
      <img
        src={art.legacyPlaceholderSrc}
        alt=""
        draggable={false}
        className="h-full w-full select-none object-cover"
        style={{ imageRendering: "pixelated" }}
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: art.cssColor }}>
      {art.groundSrc && (
        <img
          src={art.groundSrc}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />
      )}
      {art.overlaySrc && (
        <img
          src={art.overlaySrc}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom"
        />
      )}
    </div>
  );
}