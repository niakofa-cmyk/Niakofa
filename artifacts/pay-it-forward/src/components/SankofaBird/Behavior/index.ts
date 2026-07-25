/**
 * SankofaBird/Behavior/index.ts
 *
 * Barrel for the Behavior system — landing, idle, aero, search, delivery, and takeoff.
 */

export { useLanding }         from "./Landing";
export type { LandingState, LandingPhase } from "./Landing";

export { useIdleState }       from "./Idle";
export type { IdleState, ActivityTier } from "./Idle";

export { computeAeroMode }    from "./Aero";
export type { AeroMode }      from "./Aero";

export { computeGazeVector, nextSaccadePhase } from "./Search";
export type { GazeDirection, SaccadePhase }    from "./Search";

export { computeTrustTier, computeEffectiveSkyTier } from "./Deliver";

export { TAKEOFF_DURATION_MS, APPROACH_PHASES } from "./Takeoff";
export type { ApproachPhase }                   from "./Takeoff";
