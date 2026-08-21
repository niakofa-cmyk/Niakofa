/**
 * Registry of every place in the persistent Home Region. Bounds here should
 * be aligned to the actual LegacyMapScene tile coordinates
 * (scene-cape-coast-compound.ts) once real map authoring starts -- these
 * are starter placements, not final.
 *
 * Fixes a syntax error present in the original design draft
 * (`name: "What Remains", conf` -- a stray token that would not compile).
 */

import type { WorldLocation } from "./types";

export const WORLD_LOCATIONS: Record<string, WorldLocation> = {
  "village-center": {
    id: "village-center",
    name: "Village Center",
    type: "district",
    bounds: { x: 0, y: 0, w: 20, h: 15 },
    walkable: true,
    interactable: false,
    tags: ["village", "hub"],
  },

  "mensah-compound": {
    id: "mensah-compound",
    name: "Mensah Family Compound",
    type: "building",
    bounds: { x: 7, y: 4, w: 4, h: 3 },
    walkable: true,
    interactable: true,
    defaultPrompt: "Enter the compound",
    stateKey: "mensah-compound-state",
    tags: ["village", "family", "chapter1"],
  },

  "mensah-trading-post": {
    id: "mensah-trading-post",
    name: "Mensah Trading Post",
    type: "building",
    bounds: { x: 12, y: 3, w: 3, h: 2 },
    walkable: true,
    interactable: true,
    defaultPrompt: "Enter Trading Post",
    stateKey: "trading-post-state",
    tags: ["village", "commerce", "chapter1"],
  },

  "river-north-bank": {
    id: "river-north-bank",
    name: "North River Bank",
    type: "activity-spot",
    bounds: { x: 2, y: 14, w: 6, h: 2 },
    walkable: true,
    interactable: true,
    defaultPrompt: "Fish the river",
    stateKey: "river-north-state",
    tags: ["fishing", "river", "memory", "nature"],
  },

  "old-jetty": {
    id: "old-jetty",
    name: "Old Jetty",
    type: "activity-spot",
    bounds: { x: 9, y: 15, w: 4, h: 1 },
    walkable: true,
    interactable: true,
    defaultPrompt: "Fish from the jetty",
    stateKey: "old-jetty-state",
    tags: ["fishing", "river", "memory"],
  },

  "what-remains-ruins": {
    id: "what-remains-ruins",
    name: "What Remains",
    type: "memory-site",
    bounds: { x: 13, y: 1, w: 3, h: 3 },
    walkable: true,
    interactable: true,
    defaultPrompt: "Examine the ruins",
    stateKey: "what-remains-state",
    tags: ["memory", "story", "what-remains"],
  },

  "elder-home": {
    id: "elder-home",
    name: "Elder's Dwelling",
    type: "building",
    bounds: { x: 10, y: 5, w: 2, h: 2 },
    walkable: true,
    interactable: true,
    defaultPrompt: "Speak with the Elder",
    stateKey: "elder-home-state",
    tags: ["village", "relationship", "npc"],
  },
};

export function getLocation(id: string): WorldLocation | undefined {
  return WORLD_LOCATIONS[id];
}

export function getLocationsByTag(tag: string): WorldLocation[] {
  return Object.values(WORLD_LOCATIONS).filter((loc) => loc.tags.includes(tag));
}
