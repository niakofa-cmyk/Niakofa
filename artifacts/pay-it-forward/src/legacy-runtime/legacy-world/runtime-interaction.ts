import { useMemo } from "react";
import { getPrimaryLocationAt, getLocationsAt, type Point, type DetectorOptions } from "./geometry";
import { getActivitiesForLocation } from "./activities";
import type { WorldLocation, WorldActivity } from "./types";

export interface InteractionFrame {
  location: WorldLocation | null;
  activity: WorldActivity | null;
  prompt: string | null;
}

/** Call every frame (or on movement) from the PixiJS side -- see LegacyGameCanvas.tsx's ticker. */
export function evaluateInteraction(playerPos: Point, options?: { padding?: number; tags?: string[] }): InteractionFrame {
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
