/**
 * SankofaBird/Flight/Hover.ts
 *
 * Hover / WAIR (Wing-Assisted Incline Running) utilities.
 * WAIR activates the hover aerodynamic mode — forward-angled wings,
 * powerful downstroke, reduced forward lean.
 */

export { computeAeroMode } from "@/lib/sankofa-bird-math";
export type { AeroMode } from "@/lib/sankofa-bird-math";

/** Landing-phase values that represent hover-like states. */
export const HOVER_PHASES = ["hover", "slowflap"] as const;
export type HoverPhase = typeof HOVER_PHASES[number];
