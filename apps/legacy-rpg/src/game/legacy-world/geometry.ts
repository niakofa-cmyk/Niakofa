import type { WorldLocation } from "./types";
import { WORLD_LOCATIONS } from "./locations";

export interface Point { x: number; y: number }
export interface Bounds { x: number; y: number; w: number; h: number }

export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.w && point.y >= bounds.y && point.y <= bounds.y + bounds.h;
}

export function expandBounds(bounds: Bounds, padding: number): Bounds {
  return { x: bounds.x - padding, y: bounds.y - padding, w: bounds.w + padding * 2, h: bounds.h + padding * 2 };
}

export interface DetectorOptions {
  padding?: number;
  interactableOnly?: boolean;
  tags?: string[];
}

export function getLocationsAt(playerPos: Point, options: DetectorOptions = {}): WorldLocation[] {
  const { padding = 0.5, interactableOnly = true, tags } = options; // padding in tile units, matches TILE_SIZE_PX-scaled world coords
  return Object.values(WORLD_LOCATIONS).filter((loc) => {
    if (interactableOnly && loc.interactable === false) return false;
    if (tags && tags.length > 0 && !tags.some((t) => loc.tags.includes(t))) return false;
    const testBounds = padding > 0 ? expandBounds(loc.bounds, padding) : loc.bounds;
    return pointInBounds(playerPos, testBounds);
  });
}

export function getPrimaryLocationAt(playerPos: Point, options: DetectorOptions = {}): WorldLocation | undefined {
  return getLocationsAt(playerPos, options)[0];
}
