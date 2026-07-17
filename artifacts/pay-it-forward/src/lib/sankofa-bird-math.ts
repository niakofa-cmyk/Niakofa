/**
 * sankofa-bird-math.ts
 *
 * Pure computation functions extracted from SankofaBird.tsx.
 * All functions are deterministic and side-effect-free so they can be
 * unit-tested without a DOM, React, or browser environment.
 *
 * SankofaBird.tsx imports these instead of inlining the math, so any
 * change to flight behaviour is reflected in tests automatically.
 */

/**
 * Landing-sequence phases.
 * Full cycle (with takeoff + dive):
 *   idle → takeoff → flying (→ dive → slowflap → hover → perch → idle)
 *
 * takeoff: crouches → wings spread → two strong flaps → cruise (1200ms total)
 * dive:    sharp forward pitch as bird targets destination (600ms)
 *          simulates "approaching destination → gradually slows → begins descending"
 */
export type LandingPhase = "flying" | "dive" | "slowflap" | "hover" | "perch" | "idle" | "takeoff";

// ── Rotation ──────────────────────────────────────────────────────────────────

/**
 * Compute the bird's on-screen rotation (CSS `rotate` value) from world-frame
 * GPS heading and current map camera bearing.
 *
 * In north-up mode `mapBearing = 0` so the bird points toward its GPS heading.
 * In heading-up mode `mapBearing = heading` so the bird always faces screen-top.
 *
 * Result is always in [0, 360).
 */
export function computeScreenRotation(
  heading: number,
  mapBearing: number,
): number {
  return (((heading - mapBearing) % 360) + 360) % 360;
}

// ── Bank angle ────────────────────────────────────────────────────────────────

/**
 * Return the shortest signed angular delta between `prev` and `next` headings.
 * Result is always in the half-open interval (-180, +180].
 *
 * This is the primitive used to decide turn direction:
 *   positive → rightward turn
 *   negative → leftward turn
 */
export function shortestHeadingDelta(prev: number, next: number): number {
  // JS `%` preserves the sign of the dividend, so (-358 % 360) === -358, not 2.
  // Adding 540 before the modulo ensures the intermediate value is always
  // positive (delta ∈ (-360, 360) + 540 ∈ (180, 900)), so % 360 lands in
  // [0, 360) before subtracting 180 to get the signed (-180, 180] range.
  const delta = next - prev;
  return ((delta % 360) + 540) % 360 - 180;
}

/**
 * Clamp a heading delta to the bird's maximum bank angle (±25°).
 * Scale factor 2.8 converts a typical turn rate (e.g. 9°/update) to a
 * visually pleasing bank of ~25°.
 *
 * @param headingDelta - Already the shortest signed delta, e.g. from shortestHeadingDelta()
 */
export function computeBankAngle(headingDelta: number): number {
  return Math.max(-25, Math.min(25, headingDelta * 2.8));
}

// ── Differential wing banking ─────────────────────────────────────────────────

/**
 * Compute per-wing amplitude extras for banked flight.
 *
 * When banking right (bankDeg > 0):
 *   left wing is outside → extends (+extra)
 *   right wing is inside → folds (−extra)
 *
 * When banking left (bankDeg < 0):
 *   right wing is outside → extends (+extra)
 *   left wing is inside → folds (−extra)
 *
 * "Extra" is added to the wing's base ±15° idle amplitude.
 */
export function computeWingExtras(bankDeg: number): {
  leftExtra: number;
  rightExtra: number;
} {
  if (bankDeg === 0) return { leftExtra: 0, rightExtra: 0 };
  const abs = Math.abs(bankDeg);
  return {
    leftExtra:  bankDeg > 0 ?  abs * 0.4 : -abs * 0.4,
    rightExtra: bankDeg < 0 ?  abs * 0.4 : -abs * 0.4,
  };
}

/**
 * Compute tail rudder bend from bank angle.
 * The tail bends toward the turn direction (lighter than body bank).
 */
export function computeTailBend(bankDeg: number): number {
  return bankDeg * 0.6;
}

/**
 * Compute anticipatory head-lead angle in degrees.
 *
 * When the bird turns, the head rotates ahead of the body — matching the
 * doc's "Head looks first → Body follows → Tail bends" sequence.
 * Combining the current bank angle with an optional upcoming-turn signal
 * gives a richer, more cinematic result:
 *
 *  • bankDeg alone covers reactive turns (real-time GPS heading change).
 *  • upcomingTurn adds a subtle anticipatory glance (bird "sees" the turn
 *    before it happens) — the intelligence cue from the vision doc.
 *
 * Result clamped to ±22° so the head never over-rotates past the beak.
 */
export function computeHeadLeadDeg(
  bankDeg: number,
  upcomingTurn: "left" | "right" | null,
): number {
  // Head leads the body bank by ~90% — it rotates into the turn first
  const fromBank = bankDeg * 0.9;
  // Anticipatory glance: bird looks toward upcoming turn before it arrives
  const fromGlance = upcomingTurn === "left" ? -5 : upcomingTurn === "right" ? 5 : 0;
  return Math.max(-22, Math.min(22, fromBank + fromGlance));
}

// ── Flight mode ───────────────────────────────────────────────────────────────

/**
 * Derive `isMoving` and `isGliding` from speed, navigating flag, and landing phase.
 *
 * isMoving  — true when the bird should flap faster and lean forward.
 * isGliding — true when speed > 50 m/s (airplane): wings spread, barely oscillate.
 */
export function computeFlightMode(
  speedMs: number,
  navigating: boolean,
  landingPhase: LandingPhase,
): { isMoving: boolean; isGliding: boolean } {
  // During "takeoff" we use dedicated CSS keyframes (data-landing="takeoff"),
  // not the generic data-flying="true" rules — so isMoving stays false here.
  const isMoving = (navigating || landingPhase === "flying") && speedMs > 0.3;
  const isGliding = isMoving && speedMs > 50;
  return { isMoving, isGliding };
}

/**
 * Speed tier label — maps GPS speed to the doc's named tiers.
 * Used in the test harness and debug HUD.
 */
export type SpeedTier = "idle" | "walking" | "running" | "driving" | "airplane";

export function getSpeedTier(speedMs: number): SpeedTier {
  if (speedMs <= 0.3) return "idle";
  if (speedMs > 50)   return "airplane";  // gliding animation
  if (speedMs > 10)   return "driving";   // ~5 flaps/sec
  if (speedMs > 2)    return "running";   // ~2 flaps/sec
  return "walking";                        // ~1 flap/sec
}

// ── Animation rates ───────────────────────────────────────────────────────────

/**
 * Compute wing flap period in milliseconds.
 *
 * Doc speed tiers:
 *   idle/walking → 1/sec  → 1 400 ms
 *   running      → 2/sec  →   500 ms
 *   driving      → 5/sec  →   200 ms
 *   airplane     → glide  → 4 000 ms
 *
 * The formula `1 + speedMs / 2.5` produces:
 *   0 m/s  → 1   flap/sec (1 000 ms)
 *   5 m/s  → 3   flaps/sec (~333 ms)
 *   10 m/s → 5   flaps/sec (200 ms, clamped)
 *   50 m/s → 5   flaps/sec (200 ms, still clamped — isGliding takes over)
 *
 * Minimum hard floor is 180 ms (prevents flickering at very high speed).
 */
export function computeFlapPeriodMs(opts: {
  isMoving: boolean;
  isGliding: boolean;
  speedMs: number;
  landingPhase: LandingPhase;
}): number {
  const { isMoving, isGliding, speedMs, landingPhase } = opts;
  if (isGliding)                                                return 4000;
  // Takeoff: two strong power flaps before settling into cruise cadence
  if (landingPhase === "takeoff")                               return 250;
  if (landingPhase === "slowflap")                              return 1000;
  if (
    landingPhase === "hover" ||
    landingPhase === "perch" ||
    landingPhase === "idle"
  )                                                             return 1400;
  if (!isMoving)                                                return 1400;
  const flapsPerSec = Math.min(5, 1 + speedMs / 2.5);
  return Math.max(180, 1000 / flapsPerSec);
}

/**
 * Compute body lean angle in degrees.
 *
 * Idle / landed → 0°
 * Slow flight   → 6°
 * Fast flight   → up to 15° (linearly: 6 + speedMs, clamped)
 * Glide (air)   → 12° fixed flat posture
 */
export function computeLeanDeg(opts: {
  isMoving: boolean;
  isGliding: boolean;
  speedMs: number;
  landingPhase: LandingPhase;
}): number {
  const { isMoving, isGliding, speedMs, landingPhase } = opts;
  if (isGliding)                                                return 12;
  if (landingPhase === "slowflap")                              return 6;
  if (
    landingPhase === "hover" ||
    landingPhase === "perch" ||
    landingPhase === "idle"
  )                                                             return 0;
  if (!isMoving)                                                return 0;
  return Math.min(15, 6 + speedMs);
}
