/**
 * SankofaBird/Flight/Glide.ts
 *
 * Glide-mode utilities — re-exports the relevant math functions
 * and defines glide-detection thresholds used across the codebase.
 */

export {
  computeFlightMode,
  computeFlapPeriodMs,
  computeLeanDeg,
} from "@/lib/sankofa-bird-math";

/** Speed threshold above which the bird enters visual-glide posture (m/s). */
export const VISUAL_GLIDE_THRESHOLD_MS = 10;

/** Speed threshold above which the bird enters full aerodynamic glide (m/s). */
export const FULL_GLIDE_THRESHOLD_MS = 50;
