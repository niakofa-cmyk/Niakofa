/**
 * PixiJS scene renderer for a LegacyMapScene, implementing
 * docs/RUNTIME_ARCHITECTURE_UPDATE.md's layer stack:
 *
 *   sky -> background (parallax) -> far vegetation -> buildings -> structures
 *   -> ground -> props -> NPCs -> player -> foreground -> lighting -> weather
 *   -> particles -> UI
 *
 * legacy-map-engine.ts's LegacyMapScene/LegacyMapLayer types are
 * renderer-agnostic plain data (per the runtime update doc); this file is
 * the first thing that actually reads them and draws pixels.
 */

import "pixi.js/unsafe-eval";

import { Container, Sprite, Texture, TilingSprite, Graphics } from "pixi.js";
import type { LegacyMapScene, LegacyMapLayer, LegacyMapLayerKind } from "../lib/legacy-map-engine";
import { TILE_SIZE_PX } from "../lib/legacy-map-engine";

/**
 * Render order for static layer kinds. NPCs/player are inserted dynamically
 * at their own depth, see sortActorDepth().
 * "structure" (fences, gates, walls) sits between "building" and "prop"
 * and MUST be listed here or renderStaticLayers() crashes with undefined container.
 */
const LAYER_KIND_ORDER: LegacyMapLayerKind[] = [
  "ground",
  "decoration",
  "building",
  "structure",
  "prop",
  "foreground",
];

export interface RenderedScene {
  root: Container;
  layerContainers: Record<LegacyMapLayerKind, Container>;
  actorLayer: Container; // NPCs + player share this container, depth-sorted by y each frame
}

export function buildSceneContainers(): RenderedScene {
  const root = new Container();
  const layerContainers = {} as Record<LegacyMapLayerKind, Container>;
  const actorLayer = new Container();
  actorLayer.label = "layer:actors";

  for (const kind of LAYER_KIND_ORDER) {
    const c = new Container();
    c.label = `layer:${kind}`;
    layerContainers[kind] = c;
    root.addChild(c);
    // actors render between ground/prop and foreground -- insert the shared
    // actor layer right after "prop" so NPCs/player can walk in front of
    // props but still be occluded by "foreground" (tree canopies, roofs)
    if (kind === "prop") {
      root.addChild(actorLayer);
    }
  }

  return { root, layerContainers, actorLayer };
}

/**
 * Places every static layer from a LegacyMapScene. Tile-repeating ground
 * layers use TilingSprite (cheap, GPU-repeated); single-placement layers
 * (buildings, props) use plain Sprites positioned in tile units.
 */
export function renderStaticLayers(
  scene: LegacyMapScene,
  containers: RenderedScene["layerContainers"],
  textures: Map<string, Texture>
) {
  for (const layer of scene.layers) {
    const texture = textures.get(layer.assetId);
    if (!texture) {
      console.warn(`[legacy-scene-renderer] missing texture for assetId "${layer.assetId}" -- rendering a placeholder box, not skipping silently`);
      renderMissingAssetPlaceholder(layer, containers[layer.kind]);
      continue;
    }

    const isTileableGround = layer.kind === "ground" && layer.widthTiles && layer.heightTiles;
    const sprite = isTileableGround
      ? new TilingSprite({ texture, width: layer.widthTiles! * TILE_SIZE_PX, height: layer.heightTiles! * TILE_SIZE_PX })
      : new Sprite(texture);

    sprite.x = layer.x * TILE_SIZE_PX;
    sprite.y = layer.y * TILE_SIZE_PX;
    if (isTileableGround) {
      // Runtime ground slices preserve their source-board dimensions
      // (currently 213×150), while the world grid is 64×64. Scale the
      // repeated texture to one canonical tile before filling the layer;
      // otherwise transparent atlas padding becomes black seams in-world.
      (sprite as TilingSprite).tileScale.set(
        TILE_SIZE_PX / texture.width,
        TILE_SIZE_PX / texture.height,
      );
    }
    if (!isTileableGround) {
      // anchor bottom-center so a building's "position" is its footprint
      // origin, matching how LegacyCollisionShape/LegacyInteractionPoint
      // coordinates are authored (ground-level x/y, not top-left of sprite)
      (sprite as Sprite).anchor?.set(0.5, 1);
    }
    containers[layer.kind].addChild(sprite);
  }
}

function renderMissingAssetPlaceholder(layer: LegacyMapLayer, container: Container) {
  const g = new Graphics();
  g.rect(0, 0, TILE_SIZE_PX, TILE_SIZE_PX).fill({ color: 0xff00ff, alpha: 0.5 }).stroke({ color: 0x000000, width: 2 });
  g.x = layer.x * TILE_SIZE_PX;
  g.y = layer.y * TILE_SIZE_PX;
  container.addChild(g);
}

/**
 * Depth-sorts every child of the shared actor layer by its y (world
 * "vertical" position, semi-top-down convention: lower on screen = closer
 * to camera = drawn on top). Call once per frame after moving actors.
 * This is the concrete mechanism behind "Kwame walks behind a tree, then
 * in front of it" from the runtime update doc -- the tree is a
 * `foreground`-kind layer with a fixed higher draw order than `actorLayer`
 * for its upper canopy portion; full occlusion (partial-behind) needs a
 * split-sprite tree (trunk in `prop`, canopy in `foreground`), noted as a
 * follow-up in the README, not implemented in this pass.
 */
export function depthSortActors(actorLayer: Container) {
  actorLayer.children.sort((a, b) => a.y - b.y);
}
