/**
 * SankofaBird/Core/Context.tsx
 *
 * BirdContext — all computed animation state available to every anatomy component.
 *
 * The root Bird.tsx component runs all hooks and derived computations,
 * then provides the results here. Leaf components (Tail, Eye, Egg, etc.) read
 * only what they need via useBird() — no prop-drilling, no re-renders from
 * unrelated state changes.
 */

import type React from "react";
import { createContext, useContext } from "react";
import type { DiagonalPoseTransform } from "../Navigation/ViewSelector";
import type {
  AeroMode,
  GazeDirection,
  LandingPhase as LandingPhaseMath,
  SaccadePhase,
  TurnDirection,
} from "@/lib/sankofa-bird-math";


// Re-export for convenience
export type { LandingPhase as LandingPhaseMath } from "@/lib/sankofa-bird-math";

export interface BirdContextValue {
  // ── Props (passed through for leaf components) ─────────────────────────
  size: number;
  celebrating: boolean;
  newNotification: boolean;
  accepted: boolean;
  donated: boolean;
  nearbyUser: boolean;
  isHelping: boolean;
  batterySaver: boolean;
  nightMode: boolean;
  navigating: boolean;
  approaching: boolean;
  wairMode: boolean;
  soaring: boolean;
  matingDisplay: boolean;
  missionComplete: boolean;
  chirp: boolean;
  communityMilestone: boolean;
  weather: string;
  upcomingTurnDirection: "left" | "right" | null;
  speedMs: number;
  mapZoom: number;
  activityLevel: number;
  trustLevel: number;

  // ── Computed animation state ────────────────────────────────────────────
  /** Raw bank angle from heading change rate (degrees). */
  bankDeg: number;
  /** Bank angle clamped to ±20° at low zoom to prevent jitter. */
  effectiveBankDeg: number;
  /** Multi-stage takeoff / landing sequence phase. */
  landingPhase: LandingPhaseMath;
  /** Zoom-driven rendering tier: "low" | "mid" | "high" | "street". */
  zoomTier: "low" | "mid" | "high" | "street";
  /** True when the bird has ground-speed > 0 or is in takeoff/flight. */
  isMoving: boolean;
  /** True at airplane-speed (>50 m/s) — drives glide posture. */
  isGliding: boolean;
  /** True at >10 m/s — drives visual gliding CSS without full flap suppression. */
  isVisuallyGliding: boolean;
  /** CSS animation-duration for the wing-flap cycle (ms). */
  flapPeriodMs: number;
  /** Body forward lean angle (degrees). */
  leanDeg: number;
  /** Extra extension on the left (outside) wing during right-turn banking. */
  leftWingExtra: number;
  /** Extra extension on the right (outside) wing during left-turn banking. */
  rightWingExtra: number;
  /** Tail rudder angle matching turning direction (degrees). */
  tailBendDeg: number;
  /** Head lead angle into the turn (degrees). */
  headLeadDeg: number;
  /** 0–1 speed pressure factor — drives feather flutter amplitude. */
  speedFactor: number;
  /** Auto-escalating navigation LOD level (0 = full, 1 = reduce, 2 = minimal). */
  navLod: number;
  /** True when the bird rig is off-screen (IntersectionObserver). */
  isOffScreen: boolean;
  /** Current 0–7 idle auto-saccade phase for omnidirectional gaze drift. */
  saccadePhase: SaccadePhase;
  /**
   * True for ~80ms immediately after each saccade snap.
   * Written as data-gaze-snap so CSS can suppress ease-out transition,
   * producing an instant jump (real bird snap-hold-snap behaviour).
   */
  saccadeSnapping: boolean;
  /** Community-activity-driven posture tier. */
  activityTier: "quiet" | "normal" | "busy" | "peak";
  /** Eye blink period in ms (driven by activityTier). */
  blinkPeriodMs: number;
  /** Resolved sky tier from skyTier prop or nightMode bool. */
  effectiveSkyTier: string;
  /** Adinkra/Kente trust-tier from continuous trustLevel. */
  trustTier: "none" | "growing" | "trusted" | "elder";
  /** Aerodynamic mode derived from speed + explicit props. */
  aeroMode: AeroMode;
  /** 8-direction gaze computed from priority waterfall. */
  gazeDir: GazeDirection;
  /** Turn direction from banking. */
  turnDir: TurnDirection;
  /** 0–1 turn intensity from banking angle. */
  turnIntensity: number;
  /** Neck curve angle for Phase 17 kinematic chain (degrees). */
  neckCurveDeg: number;
  /** Body twist angle for Phase 17 (degrees). */
  bodyTwistDeg: number;
  /** Vertical gaze tilt from approach / glide signals (degrees). */
  verticalGazeDeg: number;
  /** Inside-wing tuck magnitude for Phase 17 aerodynamics. */
  insideWingTuck: number;
  /** True when Phase 17 CSS vars are active (not battery-saver / low zoom). */
  p17Active: boolean;
  /**
   * Wing deformation pose — maps to the 5 states from the official asset spec:
   * "up" (high stretch/hover), "mid" (relaxed cruise), "down" (power stroke),
   * "forward" (braking), "back" (glide). Written as data-wing-pose.
   */
  wingPose: "up" | "mid" | "down" | "forward" | "back";
  /**
   * Tail deformation pose — maps to the 4 states from the official asset spec:
   * "flare" (wide/steering), "narrow" (speed), "folded" (braking), "stream" (glide).
   * Written as data-tail-pose.
   */
  tailPose: "flare" | "narrow" | "folded" | "stream";
  /** True when the bird body should be scaleX-flipped (beak faces right). */
  facingRight: boolean;
  /** +1 when facing left, -1 when facing right — corrects bank-driven rotations. */
  facingSign: number;
  /** Combined head-lead + vertical gaze CSS var (degrees). */
  gazeRotateDeg: number;
  /** 8-sector compass quadrant from screen-relative heading. */
  headingQuadrant: string;
  /** Screen-relative heading in degrees (0–360). */
  screenRotationDeg: number;
  /** True when a valid GPS heading has been received. */
  hasHeading: boolean;

  // ── 360° multi-view sprite selection ───────────────────────────────────
  /** Named zone for the current heading (front / front-diagonal / side / back-diagonal / back). */
  viewAngle: "front" | "front-diagonal" | "side" | "back-diagonal" | "back";
  /** Opacity weight for the north-facing (front) sprite — 0–1. */
  frontOpacity: number;
  /** Opacity weight for the side-profile sprite — 0–1. */
  sideOpacity: number;
  /** Opacity weight for the south-facing (back) sprite — 0–1. */
  backOpacity: number;
  /** 2.5D diagonal pose transform for NE/SE/SW/NW headings (Poses.ts LEFT_45/RIGHT_45). */
  diagonalPose: DiagonalPoseTransform;

  // ── Per-instance SVG gradient IDs ──────────────────────────────────────
  eggGradId: string;
  eggGoldGradId: string;
  bodyGradId: string;
  wingGradLeftId: string;
  wingGradRightId: string;

  // ── DOM refs ────────────────────────────────────────────────────────────
  /** Ref to the bird rig div — used by IntersectionObserver. */
  rigRef: React.RefObject<HTMLDivElement | null>;
}

const BirdContext = createContext<BirdContextValue | null>(null);
BirdContext.displayName = "BirdContext";

export const BirdProvider = BirdContext.Provider;

/**
 * useBird — consume BirdContext inside any anatomy component.
 * Throws if called outside a SankofaBird component tree.
 */
export function useBird(): BirdContextValue {
  const ctx = useContext(BirdContext);
  if (!ctx) {
    throw new Error(
      "useBird() must be called inside a <SankofaBird> component tree."
    );
  }
  return ctx;
}
