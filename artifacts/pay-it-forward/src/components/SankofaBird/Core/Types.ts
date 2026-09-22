/**
 * SankofaBird/Core/Types.ts
 *
 * All public TypeScript types for the SankofaBird component.
 * Moved from types.ts — do NOT import from the old path.
 */

export interface SankofaBirdProps {
  /** World-frame heading in degrees (0 = true north), or null if unknown. */
  heading: number | null;
  /** Current map camera bearing in degrees — 0 in north-up mode, live in heading-up mode. */
  mapBearing?: number;
  /** Ground speed in meters/second, if known. Drives flap rate + forward lean. */
  speed?: number | null;
  /** True while turn-by-turn navigation is active (request-active screen). */
  navigating?: boolean;
  size?: number;
  /** Trigger the "celebrate" micro-reaction (request helped / donation completed). */
  celebrating?: boolean;
  /** Trigger the "notification" micro-reaction (new help request nearby). */
  newNotification?: boolean;
  /** Trigger the "accepted" micro-reaction (bird chirps + hops when request claimed). */
  accepted?: boolean;
  /** Trigger the "donation" micro-reaction — pledge paid or contribution completed.
   *  Distinct from celebrating: egg glows gold, golden sparkle particles (not teal). */
  donated?: boolean;
  /**
   * Upcoming turn direction from navigation — triggers the bird's anticipatory
   * "glance" behavior. The head tilts toward the upcoming turn a moment before
   * the instruction fires, making the mascot feel intelligent rather than reactive.
   * Only meaningful during active navigation (navigating = true).
   */
  upcomingTurnDirection?: "left" | "right" | null;
  /**
   * Current map zoom level (0–22). Used for Level-of-Detail rendering:
   *  < 10  → simplified silhouette (feather tips, highlights, legs hidden)
   *  10–14 → normal detail
   *  ≥ 15  → full cinematic detail (all layers visible, breathing active)
   * Defaults to 14 (full detail) when omitted.
   */
  mapZoom?: number;
  /**
   * True when another Niakofa user (online helper) is within ~200 m of the
   * user's current position. Triggers the bird's "wing salute" micro-reaction —
   * the left wing briefly lifts in acknowledgement then returns.
   */
  nearbyUser?: boolean;
  /**
   * True when the user is within ~50 m of the destination.
   * Triggers the bird's cinematic approach deceleration.
   */
  approaching?: boolean;
  /** True while the user is actively helping a requester. */
  isHelping?: boolean;
  /** Reduce animations to save battery (older phones, long navigation sessions). */
  batterySaver?: boolean;
  /** Night-mode sky — switches to nocturnal plumage palette. */
  nightMode?: boolean;
  /** Community activity level 0–1 — drives blink rate, crown raise, alert posture. */
  activityLevel?: number;
  /**
   * Sky tier override — "day" | "dusk" | "night" | "dawn".
   * Takes precedence over the boolean nightMode prop.
   */
  skyTier?: "day" | "golden" | "twilight" | "night";
  /**
   * Navigation LOD override (0–2). 0 = full detail; 1 = pause decorative layers;
   * 2 = pause nearly all non-essential GPU work.
   * Normally auto-escalated by navLod internal state; use this prop to
   * force a specific level from outside (e.g. user-facing battery-saver toggle).
   */
  navLodOverride?: number;
  /**
   * Phase 13: Wing-Assisted Incline Running (WAIR).
   * Activates the WAIR aerodynamic mode — forward-angled wings, powerful downstroke.
   */
  wairMode?: boolean;
  /**
   * Phase 13: Dynamic soaring mode (albatross-style).
   * Activates the soaring aerodynamic mode — wide wings, minimal flap.
   */
  soaring?: boolean;
  /**
   * Phase 13: Courtship/mating display.
   * Tail spread, crown raise, body puff, slow deliberate wing arc.
   */
  matingDisplay?: boolean;
  /**
   * Phase 14: Mission-complete emotional state.
   * Three gold ripple rings + egg pulse + crown flash.
   */
  missionComplete?: boolean;
  /**
   * Phase 14: Chirp micro-animation.
   * Lower beak opens + chirp-ring-1/2/3 expand from beak tip.
   */
  chirp?: boolean;
  /**
   * Phase 14: Weather / environmental conditions.
   * "clear" | "windy" | "rain" | "snow". Drives feather ruffling intensity.
   */
  weather?: string;
  /**
   * Phase 14: Helper trust level (0–1).
   * Maps to Adinkra/Kente trust-tier overlays on wings and body.
   * 0.00–0.25 = none, 0.25–0.55 = growing, 0.55–0.80 = trusted, 0.80–1.00 = elder.
   */
  trustLevel?: number;
  /**
   * Phase 14: Community milestone shimmer.
   * True briefly when the community pool hits a funding milestone.
   */
  communityMilestone?: boolean;
}
