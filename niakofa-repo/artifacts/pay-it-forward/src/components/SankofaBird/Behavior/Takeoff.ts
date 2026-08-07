/**
 * SankofaBird/Behavior/Takeoff.ts
 *
 * Takeoff behavior — constants and utilities for the takeoff phase.
 * The takeoff state machine itself lives in Behavior/Landing.ts (unified
 * state machine handles both takeoff and landing sequences).
 */

/** Duration of the takeoff animation phase in milliseconds. */
export const TAKEOFF_DURATION_MS = 1200;

/** Landing phases that are part of the approach/deceleration sequence. */
export const APPROACH_PHASES = ["dive", "slowflap", "hover", "perch"] as const;
export type ApproachPhase = typeof APPROACH_PHASES[number];
