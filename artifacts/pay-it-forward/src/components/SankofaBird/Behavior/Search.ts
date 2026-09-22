/**
 * SankofaBird/Behavior/Search.ts
 *
 * Search / gaze behavior — re-exports gaze-vector computation and types.
 * The bird's real-time 8-direction gaze system drives eye, head, and neck
 * micro-animations based on navigation intent and saccade phase.
 */

export { computeGazeVector, nextSaccadePhase } from "@/lib/sankofa-bird-math";
export type { GazeDirection, SaccadePhase }    from "@/lib/sankofa-bird-math";
