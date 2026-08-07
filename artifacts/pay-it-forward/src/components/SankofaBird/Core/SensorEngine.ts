/**
 * SankofaBird/Core/SensorEngine.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANKOFA MOTION ENGINE (SME) — Layer 4: Sensor Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maps raw SankofaBirdProps (GPS heading, speed, zoom, events, weather…)
 * into a unified FlightState snapshot consumed by MotionSolver.
 *
 * This is the "Sensor Engine" layer from the architecture diagram:
 *   Wind · Light · Zoom · Events → FlightState
 *
 * Flutter equivalent: stateProvider() in SankofaMotionEngine widget.
 * In the Flutter design the state-provider was a callback passed by the
 * caller.  Here it's a pure function so Bird.tsx can call it once per
 * render, store the result in a ref, and the rAF loop reads it without
 * touching React state.
 *
 * Pipeline position:
 *   SankofaBirdProps (React props)
 *     ↓
 *   ► SENSOR ENGINE (this file) — props → FlightState ◄
 *     ↓
 *   FlightState ref (updated each React render)
 *     ↓
 *   MotionSolver.step() inside rAF tick
 *
 * SME v2/v3 additions (July 2026):
 *   • windStrength / windHeading computed from wind vector magnitude + angle.
 *     These are passed to MotionSolver which blends windHeading into the
 *     effectiveHeading before the kinematic chain responds.
 */

import type { FlightState } from "./FlightState";
import type { LandingPhase } from "@/lib/sankofa-bird-math";

// ── Wind table ─────────────────────────────────────────────────────────────

/**
 * Maps the `weather` prop string to a wind vector in SVG units/s.
 * "windy" creates a strong rightward push; "rain" + "snow" have a slight
 * diagonal (simulates storm from north-west).  "clear" is calm.
 *
 * Max magnitude is "storm" = sqrt(2.2²+0.8²) ≈ 2.34. windStrength is
 * normalized against 2.34 so a storm = strength≈1.
 */
const WIND_TABLE: Record<string, { x: number; y: number }> = {
  clear:  { x: 0,    y: 0    },
  windy:  { x: 1.4,  y: 0.3  },
  rain:   { x: 0.5,  y: 0.6  },
  snow:   { x: 0.2,  y: 0.4  },
  storm:  { x: 2.2,  y: 0.8  },
};

/** Max wind magnitude (storm) for normalization → windStrength [0..1]. */
const MAX_WIND_MAGNITUDE = Math.sqrt(2.2 * 2.2 + 0.8 * 0.8); // ≈ 2.34

// ── buildFlightState ───────────────────────────────────────────────────────

/**
 * Extra inputs that Bird.tsx has already computed and are cheaper to pass
 * through than to recompute inside the sensor engine.
 */
export interface SensorExtras {
  /** From useBanking — used to derive turnRate. */
  bankDeg: number;
  /** From useLanding. */
  landingPhase: LandingPhase;
  /** True if navigation is active. */
  navigating: boolean;
  /** True when celebrating or new notification fired. */
  eventFired: boolean;
  /**
   * Screen rotation in degrees (0=north, 90=east).
   * From useGPSHeading — threaded through so MotionSolver can layer a subtle
   * screen-bearing bias on top of its heading-delta eye tracking.
   * Optional — defaults to 0 when omitted (e.g. in tests).
   */
  screenRotationDeg?: number;
  /**
   * Facing sign (+1 = bird faces left, -1 = bird faces right) — from useCompass.
   * Used by MotionSolver to flip the screen-bearing eye bias for mirrored birds.
   * Optional — defaults to +1 when omitted.
   */
  facingSign?: number;
}

/**
 * Convert raw props + computed extras into a FlightState snapshot.
 * Called once per React render in Bird.tsx; result stored in a ref for
 * the rAF physics loop to read without triggering re-renders.
 *
 * SME v2/v3: now also computes windStrength and windHeading from the wind
 * vector, enabling the solver to blend wind into effectiveHeading before
 * the kinematic chain responds (matching Flutter's dampedApproachAngle
 * crosswind-drift design).
 */
export function buildFlightState(
  heading:      number | null,
  speed:        number,
  weather:      string,
  batterySaver: boolean,
  extras:       SensorExtras,
): FlightState {
  const { bankDeg, landingPhase, navigating, eventFired } = extras;

  // ── Heading (radians) ─────────────────────────────────────────────────
  // Convert degrees to radians; default 0 (north) when no GPS fix.
  const headingRadians = heading !== null
    ? (heading * Math.PI) / 180
    : 0;

  // ── Velocity (0..1 normalized) ────────────────────────────────────────
  // 15 m/s ≈ brisk cycling; cap there.  Match the speedFactor used elsewhere.
  const velocity = Math.min(1, Math.max(0, speed / 15));

  // ── Turn rate (rad/s, signed) ─────────────────────────────────────────
  // Derive from bank angle: bank ±25° maps to ≈ ±0.87 rad/s.
  // Division by 28.6 ≈ (180/π / 2) converts deg to a reasonable rad/s.
  const turnRate = bankDeg / 28.6;

  // ── Hover amount (0..1) ───────────────────────────────────────────────
  // Full hover during slow-flap / hover / perch phases,
  // gradual build during approach / dive.
  const hoverAmount =
    landingPhase === "hover"    ? 1.0 :
    landingPhase === "slowflap" ? 0.7 :
    landingPhase === "perch"    ? 1.0 :
    landingPhase === "dive"     ? 0.35 :
    velocity < 0.1              ? 0.3 :
    0;

  // ── Flags ─────────────────────────────────────────────────────────────
  const landing = landingPhase !== "flying" && landingPhase !== "idle" && landingPhase !== "takeoff";
  const idle    = !navigating && speed < 0.5;

  // ── Wind vector ───────────────────────────────────────────────────────
  const wind = WIND_TABLE[weather] ?? WIND_TABLE["clear"];

  // ── Wind strength + heading (SME v2/v3) ───────────────────────────────
  // windStrength: magnitude of the wind vector normalized to [0..1].
  // windHeading:  the direction the wind blows toward (radians, north=0).
  // These feed MotionSolver's effectiveHeading blend, giving a physical
  // crosswind-drift effect (head is pushed slightly toward wind direction
  // before the kinematic chain responds).
  const windMagnitude = Math.sqrt(wind.x * wind.x + wind.y * wind.y);
  const windStrength  = Math.min(1, windMagnitude / MAX_WIND_MAGNITUDE);
  // atan2(windY, windX) gives the angle from +X axis (east).
  // Offset by -π/2 to align with our north=0 convention.
  const windHeading   = windMagnitude > 0
    ? Math.atan2(wind.y, wind.x) - Math.PI / 2
    : 0;

  // ── Notification pulse ────────────────────────────────────────────────
  // Solver owns the decay; we just inject 1.0 on event and leave the rest
  // to MotionSolver._notificationDecay.
  const notificationPulse = eventFired ? 1.0 : 0;

  const { screenRotationDeg = 0, facingSign = 1 } = extras;

  return {
    headingRadians,
    velocity,
    turnRate,
    hoverAmount,
    landing,
    idle,
    windX: wind.x,
    windY: wind.y,
    windStrength,
    windHeading,
    notificationPulse,
    batterySaver,
    screenRotationDeg,
    facingSign,
  };
}
