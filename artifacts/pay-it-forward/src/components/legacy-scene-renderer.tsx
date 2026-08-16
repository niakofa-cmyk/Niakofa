/**
 * LegacySceneRenderer
 *
 * Renders a LegacyMapScene using the v1 environment asset pack.
 * Layers: ground → decoration → building → prop → foreground.
 *
 * Design notes:
 *  - Ground tiles are rendered as a CSS grid with background-image pointing
 *    at the real PNG. Each tile DIV is TILE_SIZE_PX × TILE_SIZE_PX with
 *    background-size: cover so it fills cleanly at any display density.
 *  - Buildings/props are positioned absolutely over the ground grid using
 *    pixel offsets (tileX * TILE_SIZE_PX, tileY * TILE_SIZE_PX). Width/height
 *    from layer.widthTiles / layer.heightTiles, defaulting to 1×1.
 *  - Interaction points pulse as a soft amber ring when `showInteractions` is
 *    true — so the player can see what's touchable.
 *  - The whole scene clips to its declared tileSizePx × widthTiles/heightTiles
 *    bounding box, so it works as a drop-in backdrop inside any container.
 */

import { getEnvAsset } from "@/lib/legacy-environment-assets";
import type { LegacyMapScene, LegacyMapLayer, LegacyInteractionPoint } from "@/lib/legacy-map-engine";
import { MapPin } from "lucide-react";

export interface LegacySceneRendererProps {
  scene: LegacyMapScene;
  /** Override scene tile size for the renderer (defaults to scene.tileSizePx). */
  tileSizePx?: number;
  /** If true, renders amber pulse rings over every interaction point. */
  showInteractions?: boolean;
  /** Called when the player taps an interaction point. */
  onInteract?: (point: LegacyInteractionPoint) => void;
  className?: string;
}

export function LegacySceneRenderer({
  scene,
  tileSizePx,
  showInteractions = false,
  onInteract,
  className = "",
}: LegacySceneRendererProps) {
  const TS = tileSizePx ?? scene.tileSizePx;
  const W = scene.widthTiles * TS;
  const H = scene.heightTiles * TS;

  // Split layers by kind for correct paint order
  const groundLayers = scene.layers.filter((l) => l.kind === "ground");
  const decorationLayers = scene.layers.filter((l) => l.kind === "decoration");
  const buildingLayers = scene.layers.filter((l) => l.kind === "building");
  const propLayers = scene.layers.filter((l) => l.kind === "prop");
  const structureLayers = scene.layers.filter((l) => l.kind === "structure");
  const foregroundLayers = scene.layers.filter((l) => l.kind === "foreground");

  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ width: W, height: H }}
      role="img"
      aria-label={scene.label}
    >
      {/* Ground layer — CSS grid of tile images */}
      <div
        className="absolute inset-0"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${scene.widthTiles}, ${TS}px)`,
          gridTemplateRows: `repeat(${scene.heightTiles}, ${TS}px)`,
        }}
      >
        {/* Build the full ground grid — fill every cell, then overlay the
            explicitly authored ground layers on top */}
        {Array.from({ length: scene.heightTiles }, (_, r) =>
          Array.from({ length: scene.widthTiles }, (_, c) => {
            // Find an explicitly authored ground layer for this cell
            const authored = groundLayers.find((l) => l.x === c && l.y === r);
            return (
              <TileCell
                key={`${r}-${c}`}
                layer={authored ?? null}
                row={r}
                col={c}
                tileSizePx={TS}
                fallbackColor="#2f4a1e"
              />
            );
          }),
        )}
      </div>

      {/* Decoration layer */}
      {decorationLayers.map((layer) => (
        <OverlayLayer key={`deco-${layer.assetId}-${layer.x}-${layer.y}`} layer={layer} tileSizePx={TS} />
      ))}

      {/* Structure layer (fences, walls, gates) */}
      {structureLayers.map((layer) => (
        <OverlayLayer key={`str-${layer.assetId}-${layer.x}-${layer.y}`} layer={layer} tileSizePx={TS} />
      ))}

      {/* Building layer */}
      {buildingLayers.map((layer) => (
        <OverlayLayer key={`bld-${layer.assetId}-${layer.x}-${layer.y}`} layer={layer} tileSizePx={TS} />
      ))}

      {/* Prop layer */}
      {propLayers.map((layer) => (
        <OverlayLayer key={`prop-${layer.assetId}-${layer.x}-${layer.y}`} layer={layer} tileSizePx={TS} />
      ))}

      {/* Interaction point rings */}
      {showInteractions &&
        scene.interactionPoints.map((pt) => (
          <button
            key={pt.id}
            type="button"
            className="absolute flex items-center justify-center rounded-full
              animate-pulse ring-2 ring-amber-400 bg-amber-400/20
              hover:bg-amber-400/40 transition-colors cursor-pointer"
            style={{
              width: TS - 8,
              height: TS - 8,
              left: pt.x * TS + 4,
              top: pt.y * TS + 4,
            }}
            aria-label={`Interact: ${pt.id}`}
            onClick={() => onInteract?.(pt)}
          >
            <MapPin className="w-3 h-3 text-amber-300" />
          </button>
        ))}

      {/* Foreground layer — renders in front of player */}
      {foregroundLayers.map((layer) => (
        <OverlayLayer key={`fg-${layer.assetId}-${layer.x}-${layer.y}`} layer={layer} tileSizePx={TS} zIndex={20} />
      ))}

      {/* Lighting overlay — subtle tint per scene lighting state */}
      <LightingOverlay lighting={scene.lighting} />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TileCell({
  layer,
  row,
  col,
  tileSizePx,
  fallbackColor,
}: {
  layer: LegacyMapLayer | null;
  row: number;
  col: number;
  tileSizePx: number;
  fallbackColor: string;
}) {
  if (!layer) {
    return (
      <div
        style={{
          width: tileSizePx,
          height: tileSizePx,
          background: fallbackColor,
        }}
      />
    );
  }

  const asset = getEnvAsset(layer.assetId);

  if (!asset || asset.artTier === "placeholder") {
    return (
      <div
        style={{
          width: tileSizePx,
          height: tileSizePx,
          background: asset?.cssColor ?? fallbackColor,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: tileSizePx,
        height: tileSizePx,
        backgroundImage: `url(${asset.src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: asset.tileable ? "repeat" : "no-repeat",
      }}
    />
  );
}

function OverlayLayer({
  layer,
  tileSizePx,
  zIndex = 10,
}: {
  layer: LegacyMapLayer;
  tileSizePx: number;
  zIndex?: number;
}) {
  const asset = getEnvAsset(layer.assetId);
  const w = (layer.widthTiles ?? 1) * tileSizePx;
  const h = (layer.heightTiles ?? 1) * tileSizePx;
  const left = layer.x * tileSizePx;
  const top = layer.y * tileSizePx;

  if (!asset || asset.artTier === "placeholder") {
    return (
      <div
        className="absolute rounded-sm"
        style={{
          left, top, width: w, height: h,
          background: asset?.cssColor ?? "#666",
          zIndex,
          opacity: 0.85,
        }}
      />
    );
  }

  return (
    <img
      src={asset.src}
      alt={layer.assetId}
      className="absolute object-contain pointer-events-none select-none"
      style={{
        left, top, width: w, height: h,
        zIndex,
        imageRendering: "pixelated",
      }}
      loading="lazy"
      draggable={false}
    />
  );
}

const LIGHTING_TINT: Record<string, string> = {
  morning:   "rgba(255, 220, 150, 0.12)",
  afternoon: "rgba(255, 255, 200, 0.05)",
  evening:   "rgba(255, 140, 60, 0.22)",
  night:     "rgba(20, 30, 70, 0.55)",
  rainy:     "rgba(80, 100, 140, 0.30)",
};

function LightingOverlay({ lighting }: { lighting: string }) {
  const tint = LIGHTING_TINT[lighting];
  if (!tint) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ background: tint, zIndex: 30 }}
    />
  );
}
