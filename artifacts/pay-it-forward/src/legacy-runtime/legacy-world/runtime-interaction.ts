import { useMemo } from "react";
import { getPrimaryLocationAt, getLocationsAt, type Point, type DetectorOptions } from "./geometry";
import { getActivitiesForLocation } from "./activities";
import type { WorldLocation, WorldActivity } from "./types";
import type { LegacyMapScene } from "@/lib/legacy-map-engine";

export interface InteractionFrame {
  location: WorldLocation | null;
  activity: WorldActivity | null;
  prompt: string | null;
}

/** Call every frame (or on movement) from the PixiJS side -- see LegacyGameCanvas.tsx's ticker. */
function getSceneInteraction(scene: LegacyMapScene, playerPos: Point, padding: number): InteractionFrame {
  const nearest = scene.interactionPoints
    .map((point) => ({
      point,
      distance: Math.hypot(playerPos.x - point.x, playerPos.y - point.y),
    }))
    .filter(({ distance }) => distance <= padding)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest) return { location: null, activity: null, prompt: null };

  const { point } = nearest;
  const location: WorldLocation = {
    id: `scene:${scene.id}:${point.id}`,
    name: point.id.replace(/-/g, " "),
    type: "landmark",
    bounds: { x: point.x - padding, y: point.y - padding, w: padding * 2, h: padding * 2 },
    walkable: true,
    interactable: true,
    defaultPrompt: `Interact: ${point.id.replace(/-/g, " ")}`,
    tags: ["scene", scene.id],
  };

  const activity: WorldActivity = {
    id: `scene-activity:${scene.id}:${point.id}`,
    locationId: location.id,
    type: point.triggers.type === "questStep" ? "quest-objective"
      : point.triggers.type === "vaultArtifact" ? "memory-echo"
      : "dialogue",
    runtime: "inline",
    canRepeat: true,
    label: location.defaultPrompt,
    onComplete: () => {
      const trigger = point.triggers;
      if (trigger.type === "vaultArtifact") {
        return [
          { type: "add-memory-echo", locationId: location.id, memoryId: trigger.artifactId },
          {
            type: "journal-entry",
            title: `Memory: ${location.name}`,
            body: `A family memory surfaces at the ${location.name}.`,
            tags: ["mensah-compound", "memory"],
          },
        ];
      }
      if (trigger.type === "questStep") {
        return [
          { type: "quest-echo", questId: `${trigger.questId}:${trigger.stepId}` },
          {
            type: "journal-entry",
            title: `Compound task: ${location.name}`,
            body: `Kwame completed the ${trigger.stepId.replace(/-/g, " ")} task.`,
            tags: ["mensah-compound", "quest"],
          },
        ];
      }
      if (trigger.type === "worldEvolutionReveal") {
        return [{
          type: "journal-entry",
          title: `World revealed: ${location.name}`,
          body: `A new layer of the family world becomes visible at the ${location.name}.`,
          tags: ["mensah-compound", "world-evolution"],
        }];
      }
      return [{
        type: "journal-entry",
        title: `Explored: ${location.name}`,
        body: `Kwame paused at the ${location.name} and listened to what the compound held.`,
        tags: ["mensah-compound", "dialogue"],
      }];
    },
  };

  return { location, activity, prompt: location.defaultPrompt ?? null };
}

export function evaluateInteraction(
  playerPos: Point,
  options?: { padding?: number; tags?: string[]; scene?: LegacyMapScene },
): InteractionFrame {
  if (options?.scene) {
    const sceneInteraction = getSceneInteraction(options.scene, playerPos, options.padding ?? 0.6);
    if (sceneInteraction.location) return sceneInteraction;
  }

  const location =
    getPrimaryLocationAt(playerPos, { padding: options?.padding ?? 0.6, interactableOnly: true, tags: options?.tags }) ?? null;
  if (!location) return { location: null, activity: null, prompt: null };

  const activities = getActivitiesForLocation(location.id);
  const activity = activities.find((a) => a.type === "fishing") ?? activities[0] ?? null;
  return { location, activity, prompt: location.defaultPrompt ?? activity?.label ?? null };
}

/** React-side mirror for UI chrome (prompt text, journal panel) -- the PixiJS side remains authoritative for gameplay. */
export function usePlayerLocation(playerPos: Point | null | undefined, options: DetectorOptions = {}) {
  const tagsKey = options.tags?.join(",");
  const primary = useMemo<WorldLocation | undefined>(() => {
    if (!playerPos) return undefined;
    return getPrimaryLocationAt(playerPos, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPos?.x, playerPos?.y, options.padding, options.interactableOnly, tagsKey]);

  const all = useMemo<WorldLocation[]>(() => {
    if (!playerPos) return [];
    return getLocationsAt(playerPos, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPos?.x, playerPos?.y, options.padding, options.interactableOnly, tagsKey]);

  return {
    location: primary,
    locations: all,
    isInLocation: !!primary,
    canInteract: !!primary?.interactable,
    prompt: primary?.defaultPrompt ?? null,
    locationId: primary?.id ?? null,
  };
}
