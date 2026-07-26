/**
 * SpiritAnimal/types.ts
 *
 * The species-agnostic contract every Spirit Animal companion implements.
 * map.tsx, request-active.tsx, civic-task-nav.tsx, and any other call site
 * should depend on this contract (via SpiritAnimalAvatar), never on a
 * specific animal's props — that's what lets a new companion (Black
 * Panther today, more later) drop in without touching call sites.
 *
 * This is deliberately the *shared subset* of what SankofaBirdProps already
 * exposed (see components/SankofaBird/Core/Types.ts) — general app/nav
 * state that any companion should be able to react to. Flight-only physics
 * (wairMode, soaring, matingDisplay) stayed on SankofaBirdProps because
 * they don't mean anything for a ground animal; a Black-Panther-only
 * equivalent (e.g. `stalking`, `sprinting`, `pouncing`) should live on
 * BlackPantherProps the same way, not get forced into this shared type.
 */

/** Every selectable Spirit Animal. Keep in sync with the backend's
 *  VALID_SPIRIT_ANIMALS in artifacts/api-server/src/routes/users.ts and the
 *  `spirit_animal` enum in lib/api-spec/openapi.yaml. */
export const SPIRIT_ANIMAL_IDS = ["sankofa_bird", "black_panther"] as const;
export type SpiritAnimalId = typeof SPIRIT_ANIMAL_IDS[number];

export const SPIRIT_ANIMAL_LABELS: Record<SpiritAnimalId, string> = {
  sankofa_bird: "Sankofa Bird",
  black_panther: "Black Panther",
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
