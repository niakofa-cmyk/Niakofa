/**
 * SankofaBird/Core/FlightState.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANKOFA MOTION ENGINE (SME) — Layer 2: Flight State
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TypeScript port of the Flutter FlightState data class.
 * Pure data — no React, no DOM, no side effects.
 *
 * Pipeline position:
 *   SVG (Skeleton/Bones, Anatomy/*)
 *     ↓
 *   Rig (SankofaRig — pivot points, transform-origins)
 *     ↓
 *   ► FLIGHT STATE (this file) — unified sensor snapshot ◄
 *     ↓
 *   Motion Solver (MotionSolver — head-to-tail kinematic chain)
 *     ↓
 *   Sensor Engine (SensorEngine — maps props → FlightState)
 *     ↓
 *   Animation Mixer (spring physics, directional pose blending)
 *     ↓
 *   Renderer / CSS vars
 *
 * Flutter equivalent: flight_state.dart
 *
 * SME v2/v3 additions (July 2026):
 *   • windStrength / windHeading — wind is blended into effectiveHeading
 *     BEFORE the kinematic chain responds, producing a more physical
 *     "crosswind drift" effect vs. the old windX/windY chest-nudge approach.
 *   • windX / windY kept for backward compatibility with existing CSS rules
 *     (P13 feather-ruffle effects, Phase 6 turbulence, etc.).
 */

/** Unified snapshot of all flight-physics inputs consumed by MotionSolver. */
export interface FlightState {
  /** Desired direction of travel in radians (0 = north = up on screen). */
  headingRadians: number;

  /**
   * Normalized ground speed [0..1].
   * 0 = stationary, 1 = ~15 m/s (brisk running/cycling pace).
   * Drives flap frequency + amplitude in the solver.
   */
  velocity: number;

  /**
   * Turn rate in rad/s, signed.
   * Positive = clockwise (right turn), negative = counter-clockwise.
   * Drives body roll integration in MotionSolver.
   */
  turnRate: number;

  /**
   * Hover intensity [0..1].
   * 0 = cruising flight, 1 = fully hovering / near-landing deceleration.
   * Modulates wing amplitude in the solver (hover → higher amplitude).
   */
  hoverAmount: number;

  /** True during the final landing deceleration sequence. */
  landing: boolean;

  /** True when stationary and not navigating. */
  idle: boolean;

  /**
   * Simulated wind vector (SVG units/s) — legacy fields kept for CSS rules
   * that read windX/windY directly (P6 turbulence, P13 feather-ruffle, etc.).
   * Derived from the `weather` prop.
   */
  windX: number;
  windY: number;

  /**
   * Wind strength [0..1] — SME v2/v3 addition.
   * Blended into effectiveHeading in the solver BEFORE the head responds,
   * producing a physical crosswind-drift effect.
   * 0 = calm, 1 = gale-force (storm preset).
   * Derived from sqrt(windX²+windY²) / 2.2 (storm magnitude).
   */
  windStrength: number;

  /**
   * Wind heading in radians — SME v2/v3 addition.
   * Direction the wind is blowing *toward* (same convention as headingRadians).
   * Computed from atan2(windY, windX) in SensorEngine.
   */
  windHeading: number;

  /**
   * Notification / event pulse [0..1].
   * Set to 1.0 when a new notification or celebration fires, then
   * decays toward 0 inside MotionSolver.step() so the solver owns the
   * decay timing rather than React's render cycle.
   */
  notificationPulse: number;

  /** Mirror of the batterySaver prop — throttles the solver's physics loop. */
  batterySaver: boolean;

  /**
   * Screen rotation of the bird in degrees — the angle of travel on screen
   * (0 = north/up, 90 = east/right, 180 = south/down, 270 = west/left).
   * Used by MotionSolver to make the eyes track the actual map heading.
   * Optional for backward compatibility with partial test FlightState objects.
   */
  screenRotationDeg?: number;

  /**
   * Facing sign derived from heading:
   *   +1 = bird faces LEFT  in SVG space (west-half headings, no scaleX flip)
   *   -1 = bird faces RIGHT in SVG space (east-half headings, scaleX(-1) flip)
   * Used by MotionSolver for eye tracking direction correction.
   * Optional for backward compatibility.
   */
  facingSign?: number;
}

/** Build a default (stationary, idle) FlightState. */
export function createFlightState(): FlightState {
  return {
    headingRadians: 0,
    velocity: 0,
    turnRate: 0,
    hoverAmount: 0,
    landing: false,
    idle: true,
    windX: 0,
    windY: 0,
    windStrength: 0,
    windHeading: 0,
    notificationPulse: 0,
    batterySaver: false,
  };
}
