/**
 * SpiritAnimal/SpiritAnimalAvatar.tsx
 *
 * The single entry point call sites (map.tsx, request-active.tsx,
 * civic-task-nav.tsx, NavigationOverlay, ...) should render instead of
 * importing a specific animal directly. It reads `species` and dispatches
 * to that animal's renderer, passing the shared SpiritCompanionProps
 * straight through.
 *
 * Adding a third Spirit Animal later means: build its component under
 * components/<NewAnimal>/, add its id to SPIRIT_ANIMAL_IDS, and add one
 * case here — no changes needed at any call site.
 */

import type { ReactElement } from "react";
import { SankofaBird } from "@/components/SankofaBird";
import { BlackPanther } from "@/components/BlackPanther";
import type { SpiritAnimalId, SpiritCompanionProps } from "./types";

export interface SpiritAnimalAvatarProps extends SpiritCompanionProps {
  /** Which companion to render. Defaults to the Sankofa Bird — the
   *  original, and the fallback for any account without a saved
   *  preference (e.g. spirit_animal not yet loaded). */
  species?: SpiritAnimalId;
}

export function SpiritAnimalAvatar({
  species = "sankofa_bird",
  ...companionProps
}: SpiritAnimalAvatarProps): ReactElement {
  switch (species) {
    case "black_panther":
      return <BlackPanther {...companionProps} />;
    case "sankofa_bird":
    default:
      return <SankofaBird {...companionProps} />;
  }
}
