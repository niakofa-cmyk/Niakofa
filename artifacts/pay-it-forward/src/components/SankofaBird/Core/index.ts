/**
 * SankofaBird/Core/index.ts
 *
 * Barrel for the Core system — context, types, main bird component, renderer,
 * and the full Sankofa Motion Engine (SME) pipeline.
 *
 * SME Pipeline layers:
 *   Layer 1 — Rig          (SankofaRig, BirdPart, RigNode)
 *   Layer 2 — Flight State (FlightState)
 *   Layer 3 — Motion Solver(MotionSolver, SolverOutput)
 *   Layer 4 — Sensor Engine(buildFlightState, SensorExtras)
 *   Layer 5 — Animation Mixer (spring physics + rAF loop)
 */

export { SankofaBirdSvg } from "./Bird";
export { BirdProvider, useBird } from "./Context";
export type { BirdContextValue } from "./Context";
export type { SankofaBirdProps } from "./Types";
export { Renderer } from "./Renderer";

// ── SME Layer 1: Rig ─────────────────────────────────────────────────────────
export { SankofaRig, BirdPart } from "./SankofaRig";
export type { RigNode } from "./SankofaRig";

// ── SME Layer 2: Flight State ─────────────────────────────────────────────────
export { createFlightState } from "./FlightState";
export type { FlightState } from "./FlightState";

// ── SME Layer 3: Motion Solver ────────────────────────────────────────────────
export { MotionSolver } from "./MotionSolver";
export type { SolverOutput } from "./MotionSolver";

// ── SME Layer 4: Sensor Engine ────────────────────────────────────────────────
export { buildFlightState } from "./SensorEngine";
export type { SensorExtras } from "./SensorEngine";

// ── SME Layer 5: Animation Mixer ─────────────────────────────────────────────
export {
  stepSpring,
  stepAngularSpring,
  stepMixer,
  createMixerStates,
  extractValues,
  MIXER_CHANNELS,
  DEFAULT_SPRING,
} from "./AnimationMixer";
export type {
  SpringState,
  SpringConfig,
  MixerChannel,
  MixerTargets,
  MixerValues,
} from "./AnimationMixer";
export { useAnimationMixer, SME_CSS_VARS } from "./useAnimationMixer";
export type { UseAnimationMixerOptions } from "./useAnimationMixer";
