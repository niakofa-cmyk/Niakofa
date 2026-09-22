/**
 * SankofaBird/Core/AnimationMixer.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANKOFA MOTION ENGINE (SME) — Layer 5: Animation Mixer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Where this sits in the engine pipeline:
 *
 *   SVG (Skeleton/Bones, Anatomy/*)
 *     ↓
 *   Rig (Skeleton/Pivots + Constraints — pivot points, transform-origins)
 *     ↓
 *   Flight Engine (Flight/*, sankofa-bird-math.ts — bank, lean, wing extras…)
 *     ↓
 *   Sensor Engine (Navigation/* — Compass, GPSHeading, MapBearing fusion)
 *     ↓
 *   ► ANIMATION MIXER (this file) ◄
 *     ↓
 *   Renderer.tsx / anatomy components
 *
 * ── Why this layer was missing ────────────────────────────────────────────
 * Every layer above already computes the CORRECT target value every render
 * (headLeadDeg, neckCurveDeg, bodyTwistDeg, tailBendDeg, effectiveBankDeg…).
 * But those targets were handed to the DOM as raw numbers, with each one
 * smoothed independently by its own CSS `transition: <prop> 0.35s ease-out`
 * declaration. That means:
 *
 *   • N independent easing curves (one per CSS custom property) instead of
 *     one coherent physical motion — the neck can finish easing before the
 *     head does, so the S-curve momentarily looks disjointed.
 *   • CSS transitions restart from whatever value they were mid-transition
 *     at when a new target arrives — no velocity carry-over, so rapid
 *     heading changes look like the rig is "catching up" rather than
 *     carrying momentum, the way a real bird's neck has inertia.
 *   • No single place to reason about "how fast does the whole rig settle,"
 *     since the answer is scattered across ~15 CSS transition declarations.
 *
 * A mixer fixes this by running ONE continuous physics loop (critically
 * damped spring, so it settles without overshoot/oscillation) that owns
 * velocity + position for every channel, ticked on requestAnimationFrame.
 * The Renderer then reads already-smoothed values and can drop the
 * per-property CSS transitions entirely (or keep them as a cheap fallback
 * for `prefers-reduced-motion`, where the mixer can be bypassed).
 *
 * ── Design ─────────────────────────────────────────────────────────────────
 * Pure, framework-agnostic spring math + a small React hook wrapper. No DOM
 * access here — callers own the CSS var / attribute write in a rAF callback
 * to avoid extra re-renders (see useAnimationMixer's `onFrame` option).
 */

/** One smoothed channel's internal spring state. */
export interface SpringState {
  value: number;
  velocity: number;
}

/** Per-channel tuning — stiffness/damping in the same units as a Rive/Unity spring. */
export interface SpringConfig {
  /** Higher = snaps to target faster. Typical: 90–260. */
  stiffness: number;
  /** Higher = less overshoot. 1.0 = critically damped (no overshoot). */
  damping: number;
  /** Below this |velocity| + |error| the channel snaps exactly to target and sleeps. */
  restThreshold?: number;
}

export const DEFAULT_SPRING: SpringConfig = { stiffness: 170, damping: 1.0, restThreshold: 0.01 };

/**
 * Named channels the mixer owns. Add new ones here as the engine grows —
 * this is the single source of truth for "what does the mixer smooth."
 */
export const MIXER_CHANNELS = [
  "bankDeg",
  "leanDeg",
  "headLeadDeg",
  "neckCurveDeg",
  "bodyTwistDeg",
  "verticalGazeDeg",
  "tailBendDeg",
  "leftWingExtra",
  "rightWingExtra",
  "insideWingTuck",
  "screenRotationDeg",
] as const;

export type MixerChannel = typeof MIXER_CHANNELS[number];

export type MixerTargets = Record<MixerChannel, number>;
export type MixerValues  = Record<MixerChannel, number>;

/** Per-channel spring tuning — wings and tail feel snappier than the heavy body/neck. */
const CHANNEL_SPRINGS: Partial<Record<MixerChannel, SpringConfig>> = {
  bankDeg:           { stiffness: 140, damping: 1.0 },
  leanDeg:           { stiffness: 130, damping: 1.05 },
  headLeadDeg:       { stiffness: 220, damping: 0.95 }, // head leads — reacts fastest
  neckCurveDeg:      { stiffness: 190, damping: 0.98 }, // follows head with slight lag
  bodyTwistDeg:      { stiffness: 150, damping: 1.02 }, // body settles after neck
  verticalGazeDeg:   { stiffness: 200, damping: 1.0 },
  tailBendDeg:       { stiffness: 160, damping: 0.9 },  // tail has a touch of overshoot — rudder flex
  leftWingExtra:     { stiffness: 240, damping: 1.0 },
  rightWingExtra:    { stiffness: 240, damping: 1.0 },
  insideWingTuck:    { stiffness: 240, damping: 1.0 },
  screenRotationDeg: { stiffness: 150, damping: 1.0 },
};

/**
 * Advance one critically-damped spring by `dtMs` toward `target`.
 * Semi-implicit Euler integration — stable at any reasonable frame rate,
 * unlike explicit Euler which can blow up with large dt (e.g. tab throttling).
 */
export function stepSpring(
  state: SpringState,
  target: number,
  dtMs: number,
  config: SpringConfig,
): SpringState {
  const dt = Math.min(0.05, dtMs / 1000); // clamp dt to 50ms — protects against tab-switch huge gaps
  const { stiffness, damping, restThreshold = 0.01 } = config;

  const error = target - state.value;
  if (Math.abs(error) < restThreshold && Math.abs(state.velocity) < restThreshold) {
    return { value: target, velocity: 0 }; // asleep — snap exactly, stop computing
  }

  // Critically-damped spring-mass-damper: a = k·error - 2·√k·damping·v
  const dampingCoeff = 2 * Math.sqrt(stiffness) * damping;
  const acceleration = stiffness * error - dampingCoeff * state.velocity;

  const velocity = state.velocity + acceleration * dt;
  const value    = state.value    + velocity    * dt;
  return { value, velocity };
}

/**
 * Angular variant of stepSpring — takes the shortest path around a 0–360°
 * wrap (e.g. screenRotationDeg going 350° → 10° springs through 20°, not
 * backwards through 340°). Everything else behaves like stepSpring.
 */
export function stepAngularSpring(
  state: SpringState,
  targetDeg: number,
  dtMs: number,
  config: SpringConfig,
): SpringState {
  // Shift the target to the nearest equivalent angle to state.value before
  // springing, so the interpolation always takes the short way around.
  const diff   = ((targetDeg - state.value + 540) % 360) - 180;
  const target = state.value + diff;
  const next   = stepSpring(state, target, dtMs, config);
  return { value: ((next.value % 360) + 360) % 360, velocity: next.velocity };
}

/**
 * Pure mixer step — advances every channel one tick. Framework-agnostic so
 * it's independently unit-testable (see sankofa-bird-animation.test.ts).
 */
export function stepMixer(
  states: Record<MixerChannel, SpringState>,
  targets: MixerTargets,
  dtMs: number,
): Record<MixerChannel, SpringState> {
  const next = {} as Record<MixerChannel, SpringState>;
  for (const channel of MIXER_CHANNELS) {
    const config = CHANNEL_SPRINGS[channel] ?? DEFAULT_SPRING;
    next[channel] = channel === "screenRotationDeg"
      ? stepAngularSpring(states[channel], targets[channel], dtMs, config)
      : stepSpring(states[channel], targets[channel], dtMs, config);
  }
  return next;
}

export function createMixerStates(initial: MixerTargets): Record<MixerChannel, SpringState> {
  const states = {} as Record<MixerChannel, SpringState>;
  for (const channel of MIXER_CHANNELS) {
    states[channel] = { value: initial[channel] ?? 0, velocity: 0 };
  }
  return states;
}

export function extractValues(states: Record<MixerChannel, SpringState>): MixerValues {
  const values = {} as MixerValues;
  for (const channel of MIXER_CHANNELS) values[channel] = states[channel].value;
  return values;
}
