/**
 * SpiritAnimal/types.ts
 *
 * The species-agnostic contract every Spirit Animal companion implements.
 * map.tsx, request-active.tsx, civic-task-nav.tsx, and any other call site
 * should depend on this contract (via SpiritAnimalAvatar), never on a
 * specific animal's props — that's what lets a new companion drop in
 * without touching call sites.
 */

/** Every selectable Spirit Animal. Keep in sync with:
 *  - artifacts/api-server/src/lib/spirit-animal.ts
 *  - lib/api-spec/openapi.yaml  spirit_animal enum */
export const SPIRIT_ANIMAL_IDS = [
  "sankofa_bird",
  "black_panther",
  "elephant",
  "lion",
  "fish_eagle",
] as const;

export type SpiritAnimalId = typeof SPIRIT_ANIMAL_IDS[number];

export const SPIRIT_ANIMAL_LABELS: Record<SpiritAnimalId, string> = {
  sankofa_bird:  "Sankofa Bird",
  black_panther: "Black Panther",
  elephant:      "African Elephant",
  lion:          "Lion",
  fish_eagle:    "Fish Eagle",
};

/** One-line feel descriptor shown in the settings chooser. */
export const SPIRIT_ANIMAL_FEEL: Record<SpiritAnimalId, string> = {
  sankofa_bird:  "Lighter · floating · flowing · graceful",
  black_panther: "Quieter · smoother · lower · moonlit",
  elephant:      "Grounded · warm · steady · sunrise",
  lion:          "Bold · golden · strong · sovereign",
  fish_eagle:    "Crisp · flowing · open skies · rivers",
};

/** Longer blurb shown under the name in the spirit animal chooser. */
export const SPIRIT_ANIMAL_BLURBS: Record<SpiritAnimalId, string> = {
  sankofa_bird:
    "Flies your route with memory, movement, and a view toward what matters. The app breathes lighter when the Bird is with you.",
  black_panther:
    "Moves with quiet strength, strategic focus, and gold-eyed protection. Shadows deepen. Every transition becomes a stalk.",
  elephant:
    "Walks with ancient wisdom and warm earth beneath every step. Unhurried. The world slows into sunrise tones.",
  lion:
    "Patrols with sovereign authority. Typography sharpens, the palette turns golden, and the world feels like open savannah.",
  fish_eagle:
    "Soars above rivers and distant mountains. Clean lines, flowing motion, and the blue calm of wide-open skies.",
};

export interface SpiritCompanionProps {
  /** World-frame heading in degrees (0 = true north), or null if unknown. */
  heading: number | null;
  /** Current map camera bearing in degrees — 0 in north-up mode, live in heading-up mode. */
  mapBearing?: number;
  /** Ground speed in meters/second, if known. Drives gait/flap rate. */
  speed?: number | null;
  /** True while turn-by-turn navigation is active (request-active screen). */
  navigating?: boolean;
  size?: number;
  /** "Request helped / donation completed" micro-reaction. */
  celebrating?: boolean;
  /** "New help request nearby" micro-reaction. */
  newNotification?: boolean;
  /** "Request claimed" micro-reaction. */
  accepted?: boolean;
  /** Pledge paid / contribution completed — distinct gold-toned reaction. */
  donated?: boolean;
  /** Upcoming turn direction from navigation — anticipatory glance/turn-of-head. */
  upcomingTurnDirection?: "left" | "right" | null;
  /** Current map zoom level (0–22) — drives Level-of-Detail rendering. Defaults to 14. */
  mapZoom?: number;
  /** True when another Niakofa user (online helper) is within ~200 m. */
  nearbyUser?: boolean;
  /** True when the user is within ~50 m of the destination. */
  approaching?: boolean;
  /** True while the user is actively helping a requester. */
  isHelping?: boolean;
  /** Reduce animations to save battery. */
  batterySaver?: boolean;
  /** Night-mode sky — switches to nocturnal palette. */
  nightMode?: boolean;
  /** Community activity level 0–1. */
  activityLevel?: number;
  /** Sky tier override — takes precedence over the boolean nightMode prop. */
  skyTier?: "day" | "golden" | "twilight" | "night";
  /** Navigation LOD override (0–2). 0 = full detail; 2 = minimal GPU work. */
  navLodOverride?: number;
}

/** The resolved behavioral state a controller returns — passed as data-attrs
 *  and CSS variables to the animal's renderer so CSS keyframes can react
 *  without JS animation loops. */
export interface SpiritBehaviorState {
  /** The primary locomotion mode the renderer should display. */
  gait: "idle" | "walk" | "trot" | "sprint" | "fly" | "soar" | "glide" | "patrol";
  /** Intensity 0–1: drives animation speed multiplier. */
  intensity: number;
  /** True while in a celebration/success micro-reaction. */
  celebrating: boolean;
  /** True while in an alert micro-reaction. */
  alerting: boolean;
  /** True while interacting with a nearby user. */
  interacting: boolean;
  /** True in rest/sleep mode. */
  resting: boolean;
  /** Additional data attributes to set on the root element (free-form for species-specific CSS). */
  dataAttrs: Record<string, string>;
}

/** The universal behavioral interface all spirit animal controllers implement. */
export interface ISpiritController {
  /** Passive awareness — animal notices the environment, scans, reacts subtly. */
  observe(props: SpiritCompanionProps): SpiritBehaviorState;
  /** No movement — resting / breathing / ambient fidget. */
  idle(props: SpiritCompanionProps): SpiritBehaviorState;
  /** Moving between locations without a fixed destination. */
  travel(props: SpiritCompanionProps): SpiritBehaviorState;
  /** Active navigation — following turn-by-turn instructions. */
  navigate(props: SpiritCompanionProps): SpiritBehaviorState;
  /** Success moment — helped someone, pledge completed, mission done. */
  celebrate(props: SpiritCompanionProps): SpiritBehaviorState;
  /** Alert — new nearby request, danger, urgent notification. */
  alert(props: SpiritCompanionProps): SpiritBehaviorState;
  /** Social moment — nearby user, greeting, acknowledgement. */
  interact(props: SpiritCompanionProps): SpiritBehaviorState;
  /** Battery saver / background / resting deeply. */
  rest(props: SpiritCompanionProps): SpiritBehaviorState;
  /** Actively guiding (helper mode, leading user to destination). */
  guide(props: SpiritCompanionProps): SpiritBehaviorState;
}
