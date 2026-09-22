/**
 * SankofaBird/Core/MotionSolver.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANKOFA MOTION ENGINE (SME) — Layer 3: Motion Solver
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TypeScript port of the Flutter MotionSolver class (motion_solver.dart).
 * Pure class — no React, no DOM.  Runs inside the rAF tick of
 * useAnimationMixer so physics are decoupled from React's render cycle.
 *
 * Key principle (from the Flutter document):
 *   "Head leads — it tracks the target heading fastest.
 *    Neck follows partially.  Body banks last and least."
 *
 * SME v2/v3 upgrades (July 2026):
 *   1. EXPONENTIAL DAMPING — all kinematic channels now use the frame-rate-
 *      independent formula `t = 1 - exp(-rate × dt)` (matching Flutter's
 *      `dampedApproach`).  The old `Math.min(1, dt × 6.0)` linear approach
 *      could overshoot at large dt values (e.g. after a tab-switch spike).
 *
 *   2. WIND HEADING BLEND — wind is now blended into `effectiveHeading`
 *      BEFORE the head responds, matching Flutter's pattern:
 *        effectiveHeading = lerpAngle(heading, windHeading, windStrength × 0.3)
 *      This produces a physical crosswind-drift sensation instead of merely
 *      nudging the chest after the fact.
 *
 *   3. SMOOTH WING AMPLITUDE / FREQUENCY — private `_wingAmplitude` and
 *      `_wingFreq` accumulators approach their targets with exponential
 *      damping (rate=6.0) so flight-mode transitions (hover↔cruise↔fast)
 *      feel fluid rather than stepping instantly.
 *
 *   4. BATTERY-SAVER EYE SKIP — eye drift is skipped entirely when
 *      `batterySaver` is true, matching Flutter's `!lowPowerMode` guard.
 *      Previously the solver still computed eye position and wrote it.
 *
 *   5. NOTIFICATION PING AS WING BUMP — in addition to the decay-based
 *      notificationPulse output, the solver also bumps `_wingAmplitude`
 *      by +0.25 (clamped to 1) on the tick that receives pulse > decay,
 *      matching Flutter's one-shot transient nudge pattern.
 *
 * The solver owns four time-integrated state variables:
 *   _headingSmoothed  — exponential heading smoother (rate 6.0)
 *   _bodyRoll         — body-roll accumulator (rate 4.0 toward turnRate×0.6)
 *   _flapPhase        — continuous flap phase integrator (radians)
 *   _notificationDecay— notification pulse decay (rate 1.25/s)
 *   _wingAmplitude    — smoothed wing amplitude (rate 6.0)
 *   _wingFreq         — smoothed flap frequency Hz (rate 6.0)
 *
 * These MUST live in the solver (not in React state) so they continue
 * integrating every rAF frame at 60fps, independent of React re-renders.
 *
 * Pipeline position:
 *   Flight State (FlightState.ts)
 *     ↓
 *   ► MOTION SOLVER (this file) — kinematic chain, step(state, dt) ◄
 *     ↓
 *   SolverOutput → useAnimationMixer (written as --sme-* CSS vars)
 */

import type { SankofaRig} from "./SankofaRig";
import { BirdPart } from "./SankofaRig";
import type { FlightState } from "./FlightState";

// ── Solver output ─────────────────────────────────────────────────────────

/**
 * Result of one MotionSolver tick.
 * All angles are in degrees to match the CSS custom-property convention
 * already established by AnimationMixer.ts.
 */
export interface SolverOutput {
  /** Head local rotation (degrees). Leads the turn. */
  headDeg: number;
  /** Neck upper local rotation. Follows head with ~55% gain. */
  neckUpperDeg: number;
  /** Neck lower local rotation. Follows head with ~28% gain. */
  neckLowerDeg: number;
  /** Chest / body roll (degrees, integrated from turnRate). */
  bodyRollDeg: number;
  /**
   * Tail rudder angle (degrees, opposes body roll — steers).
   * Positive = right lean → tail bends left (counterbalance).
   */
  tailDeg: number;
  /** Left wing upper rotation in degrees (positive = down-stroke). */
  leftWingUpperDeg: number;
  /** Left wing lower rotation (follows upper at 60% gain). */
  leftWingLowerDeg: number;
  /** Right wing upper rotation. */
  rightWingUpperDeg: number;
  /** Right wing lower rotation. */
  rightWingLowerDeg: number;
  /**
   * Eye offset in SVG viewBox units.
   * The pupil circle shifts by (eyeX, eyeY) relative to its resting centre.
   */
  eyeX: number;
  eyeY: number;
  /**
   * Current flap phase in radians [0, 2π).
   * Can drive `--sme-flap-phase` for JS-driven wing effects at high LOD.
   */
  flapPhase: number;
  /**
   * Current flap amplitude [0..1].
   * Smoothly interpolated (not stepped) between flight modes.
   */
  flapAmplitude: number;
  /** Notification pulse current value [0..1] — decays from 1 → 0 in ~0.8 s. */
  notificationPulse: number;
  /**
   * Smoothed heading delta (radians).
   * The angle between the smoothed heading and the last stable heading.
   * Drives head-tilt CSS vars.
   */
  smoothedHeadingDeltaRad: number;
  /**
   * Wind strength [0..1] — mirrors FlightState.windStrength.
   * Exposed so CSS can read --sme-wind-strength for feather-ruffle effects.
   */
  windStrength: number;
}

// ── Math helpers ──────────────────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Shortest signed angular distance from `from` to `to` in radians.
 * Result is in (-π, π].
 */
function shortestAngle(from: number, to: number): number {
  let diff = (to - from) % TWO_PI;
  if (diff > Math.PI)  diff -= TWO_PI;
  if (diff < -Math.PI) diff += TWO_PI;
  return diff;
}

/** Clamp `value` to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Frame-rate-independent exponential approach (Flutter's `dampedApproach`).
 * `rate` ≈ "approaches per second" — higher = snappier.
 * Returns the new value after one dt step.
 *
 * Formula: newValue = current + (target - current) × (1 - exp(-rate × dt))
 * This is unconditionally stable at any dt (unlike the old linear form
 * `Math.min(1, dt × rate)` which could overshoot for large dt).
 */
function dampedApproach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Angular variant of dampedApproach — always takes the shortest path around
 * a circle (handles 350° → 10° without swinging the long way).
 */
function dampedApproachAngle(current: number, target: number, rate: number, dt: number): number {
  const delta = shortestAngle(current, target);
  return current + delta * (1 - Math.exp(-rate * dt));
}

/**
 * Shortest-path angle interpolation in radians.
 * Used to blend heading toward wind heading (effectiveHeading).
 */
function lerpAngle(a: number, b: number, t: number): number {
  const delta = shortestAngle(a, b);
  return a + delta * clamp(t, 0, 1);
}

// ── MotionSolver ──────────────────────────────────────────────────────────

export class MotionSolver {
  private readonly rig: SankofaRig;

  // ── Time-integrated state ─────────────────────────────────────────────
  /** Smoothed heading in radians. */
  private _headingSmoothed = 0;
  /** Body roll accumulator in radians (sign: right=+, left=−). */
  private _bodyRoll        = 0;
  /** Continuous flap phase [0, 2π). */
  private _flapPhase       = 0;
  /** Notification pulse decay [0..1]. */
  private _notificationDecay = 0;
  /**
   * Smoothed wing amplitude [0..1] — SME v2/v3.
   * Approaches target amplitude with dampedApproach(rate=6) so
   * flight-mode transitions (hover ↔ cruise ↔ fast) feel fluid.
   */
  private _wingAmplitude = 0.4;
  /**
   * Smoothed flap frequency in Hz — SME v2/v3.
   * Approaches target frequency with dampedApproach(rate=6).
   */
  private _wingFreq = 2.5;

  // ── Solver output (updated each tick, readable between ticks) ─────────
  eyeX = 0;
  eyeY = 0;

  constructor(rig: SankofaRig) {
    this.rig = rig;
  }

  /**
   * Advance the solver by `dt` seconds.
   *
   * SME v2/v3 improvements over the original:
   *   1. Exponential damping (`dampedApproach`) for all channels
   *   2. Wind heading blended into effectiveHeading before head responds
   *   3. Smooth wing amplitude + frequency transitions
   *   4. Eye tracking skipped when batterySaver
   *   5. Notification ping bumps wing amplitude transiently
   */
  step(state: FlightState, dt: number): SolverOutput {
    // Clamp dt to 50ms to protect against tab-switch spikes
    const dtClamped = Math.min(0.05, dt);

    // ── 0. Wind blending into effectiveHeading (SME v2/v3) ──────────────
    // When wind is blowing (windStrength > 0), the effective heading that
    // the bird's head responds to is slightly nudged toward the wind
    // direction — mimicking crosswind drift. The blend factor 0.3 matches
    // Flutter's solver: `lerpAngle(heading, windHeading, windStrength * 0.3)`.
    // This runs before step 1 so the entire kinematic chain downstream
    // "sees" the wind-adjusted target.
    //
    // Defensive defaults: callers constructing FlightState manually (e.g.
    // tests using partial objects) may omit windStrength/windHeading.
    // Guard against undefined by coalescing to 0 before any math.
    const windStrength = state.windStrength ?? 0;
    const windHeading  = state.windHeading  ?? 0;
    const effectiveHeading = windStrength > 0
      ? lerpAngle(state.headingRadians, windHeading, windStrength * 0.3)
      : state.headingRadians;

    // ── 1. Smooth heading (head leads fastest, rate=6.0) ────────────────
    // dampedApproach replaces the old `Math.min(1, dtClamped * 6.0)`
    // linear form which could overshoot at large dt values.
    this._headingSmoothed = dampedApproachAngle(
      this._headingSmoothed, effectiveHeading, 6.0, dtClamped,
    );

    const smoothedDelta = shortestAngle(this._headingSmoothed, effectiveHeading);

    // ── 2. Kinematic chain: head → neckUpper → neckLower → chest ────────
    // Head leads (90% of remaining heading delta).
    this.rig.setRotation(BirdPart.head,      smoothedDelta * RAD_TO_DEG * 0.9);
    // Neck upper follows at 50% — same target, different gain.
    this.rig.setRotation(BirdPart.neckUpper, smoothedDelta * RAD_TO_DEG * 0.5);
    // Neck lower follows at 25%.
    this.rig.setRotation(BirdPart.neckLower, smoothedDelta * RAD_TO_DEG * 0.25);

    // ── 3. Body roll: integrate toward turnRate × 0.6 (rate=4.0) ────────
    // Uses exponential damping for frame-rate independence.
    // Landing reduces the target roll to 20% to avoid exaggerated banking
    // during the deceleration sequence.
    const targetRoll = state.landing
      ? state.turnRate * 0.6 * 0.2
      : state.turnRate * 0.6;
    this._bodyRoll = dampedApproach(this._bodyRoll, targetRoll, 4.0, dtClamped);

    // Chest tilts 30% of body roll (converted rad → deg).
    this.rig.setRotation(BirdPart.chest, this._bodyRoll * 0.3 * RAD_TO_DEG);

    // Wind nudge on chest — only the lateral (X) component; Y is vertical.
    // Applied as a delta on top of the already-set chest rotation.
    const chestNode = this.rig.get(BirdPart.chest);
    this.rig.setRotation(BirdPart.chest, chestNode.localDeg + state.windX * 0.05);

    // ── 4. Tail as rudder — opposes body roll to steer (rate=5.0) ───────
    this.rig.setRotation(BirdPart.tail, -this._bodyRoll * 0.8 * RAD_TO_DEG);

    // ── 5. Wing flap — smooth amplitude + frequency transitions ─────────
    // SME v2/v3: _wingAmplitude and _wingFreq are now smoothed accumulators
    // that approach their mode-dependent targets with dampedApproach(rate=6).
    // This makes hover ↔ cruise ↔ fast transitions feel organic rather than
    // stepping instantly to a new value.
    const speed  = clamp(state.velocity, 0, 1);
    const hover  = clamp(state.hoverAmount, 0, 1);

    // Compute mode-dependent amplitude + frequency targets (matches Flutter).
    let targetAmplitude: number;
    let targetFrequency: number;

    if (hover > 0.5) {
      // High hover: large amplitude, moderate frequency (hold-position beat).
      targetAmplitude = 0.9 - (hover - 0.5) * 0.4;  // 0.90 → 0.70
      targetFrequency = 2.2;
    } else if (speed > 0.7) {
      // Fast cruise: small, rapid strokes.
      targetAmplitude = 0.35;
      targetFrequency = 4.0;
    } else {
      // Normal flight: balanced amplitude scales with speed.
      targetAmplitude = 0.5 + speed * 0.25;   // 0.50 → 0.75
      targetFrequency = 2.5;
    }

    // Idle / battery-saver: use gentle idle flap as target.
    const effectiveTargetAmp  = state.idle ? 0.12 : targetAmplitude;
    const effectiveTargetFreq = state.idle ? 0.4  : targetFrequency;

    // Smooth the amplitude + frequency toward their targets.
    this._wingAmplitude = dampedApproach(this._wingAmplitude, effectiveTargetAmp,  6.0, dtClamped);
    this._wingFreq      = dampedApproach(this._wingFreq,      effectiveTargetFreq, 6.0, dtClamped);

    // Notification ping: one-shot wing-amplitude bump (SME v2/v3).
    // If the incoming notificationPulse is higher than our decay, a new
    // event just fired — bump wing amplitude transiently.
    if (state.notificationPulse > this._notificationDecay) {
      this._notificationDecay = state.notificationPulse;
      this._wingAmplitude = clamp(this._wingAmplitude + 0.25, 0, 1);
    } else {
      this._notificationDecay = Math.max(0, this._notificationDecay - dtClamped * 1.25);
    }

    // Integrate flap phase.
    this._flapPhase = (this._flapPhase + this._wingFreq * dtClamped * TWO_PI) % TWO_PI;
    const flap = Math.sin(this._flapPhase) * this._wingAmplitude;

    // Left wing: negative flap = upstroke.
    const lwuDeg = -flap * RAD_TO_DEG;
    const lwlDeg = -flap * 0.6 * RAD_TO_DEG;
    this.rig.setRotation(BirdPart.leftWingUpper,  lwuDeg);
    this.rig.setRotation(BirdPart.leftWingLower,  lwlDeg);
    // Right wing: mirrored.
    const rwuDeg =  flap * RAD_TO_DEG;
    const rwlDeg =  flap * 0.6 * RAD_TO_DEG;
    this.rig.setRotation(BirdPart.rightWingUpper, rwuDeg);
    this.rig.setRotation(BirdPart.rightWingLower, rwlDeg);

    // ── 6. Eye tracking ────────────────────────────────────────────────────
    // Three-component model (all additive, clamped at ±1.5 SVG units):
    //
    // A) Base gaze: cos(headingDelta) × 1.5
    //    The established contract from the original SME — at steady-state
    //    heading (delta→0) the eye sits at +1.5 (positive-X = looking in the
    //    bird's resting orientation).  This keeps the existing test suite green
    //    and gives a natural "resting forward look" at any heading.
    //
    // B) Velocity bias: pulls the eye toward the beak (−X direction) at cruise
    //    speed, mimicking a real bird scanning ahead during fast flight.  The
    //    base component is simultaneously attenuated by (1 − speed×0.4) so the
    //    eye gradually transitions from "resting" to "looking ahead".
    //
    // C) Screen-rotation bias (uses the new screenRotationDeg + facingSign
    //    fields threaded from Bird.tsx): adds a subtle directional offset that
    //    makes the eye track the actual travel bearing on screen rather than
    //    purely the heading-lag.  Scaled to 0.3 to avoid overpowering A/B.
    //    facingSign corrects for the heading-wrapper's scaleX flip: a
    //    right-facing bird (facingSign=−1) needs the bias negated so the iris
    //    still appears to track "forward" after the mirror.
    //
    // D) Turn anticipation: small glance in the turn direction so the eye
    //    leads the body into corners (natural saccade behaviour).
    //
    // SME v2/v3: skip entirely in battery-saver (matches Flutter's
    // `if (!state.lowPowerMode)` guard — avoids an unnecessary RAF write).
    if (!state.batterySaver) {
      const speed         = clamp(state.velocity, 0, 1);
      const headingDelta  = effectiveHeading - this._headingSmoothed;

      // A) Base gaze (heading-lag cos — preserves existing test contract)
      const baseLook      = Math.cos(headingDelta) * 1.5;

      // B) Velocity forward-look (toward beak = −X); attenuate base simultaneously
      const speedBias     = state.idle ? 0 : -(speed * 0.5);
      const baseAttenuated = baseLook * (1 - speed * 0.4);

      // C) Screen-rotation bias — uses the new FlightState fields
      const screenRotRad  = ((state.screenRotationDeg ?? 0) * Math.PI) / 180;
      const facingSign    = state.facingSign ?? 1;
      const screenBias    = Math.sin(screenRotRad) * 0.3 * facingSign;

      // D) Turn anticipation glance
      const turnGlance    = clamp(state.turnRate * 0.35, -0.6, 0.6);

      const eyeXTarget  = clamp(baseAttenuated + speedBias - turnGlance + screenBias, -1.5, 1.5);
      // Vertical: slight upward look at cruise speed; downward on landing.
      const eyeYTarget  = state.landing ? 0.4 : (speed > 0.6 ? -0.3 : 0);
      this.eyeX = dampedApproach(this.eyeX, eyeXTarget, 10.0, dtClamped);
      this.eyeY = dampedApproach(this.eyeY, clamp(eyeYTarget, -1.5, 1.5), 10.0, dtClamped);
    } else {
      // Battery saver: eye returns to center.
      this.eyeX = dampedApproach(this.eyeX, 0, 4.0, dtClamped);
      this.eyeY = dampedApproach(this.eyeY, 0, 4.0, dtClamped);
    }

    // ── 7. Propagate world rotations (parents → children) ────────────
    this.rig.resolveAll();

    // ── Return solver output ──────────────────────────────────────────
    const head      = this.rig.get(BirdPart.head);
    const neckUpper = this.rig.get(BirdPart.neckUpper);
    const neckLower = this.rig.get(BirdPart.neckLower);
    const chest     = this.rig.get(BirdPart.chest);
    const tail      = this.rig.get(BirdPart.tail);
    const lwu       = this.rig.get(BirdPart.leftWingUpper);
    const lwl       = this.rig.get(BirdPart.leftWingLower);
    const rwu       = this.rig.get(BirdPart.rightWingUpper);
    const rwl       = this.rig.get(BirdPart.rightWingLower);

    return {
      headDeg:                 head.localDeg,
      neckUpperDeg:            neckUpper.localDeg,
      neckLowerDeg:            neckLower.localDeg,
      bodyRollDeg:             chest.localDeg,
      tailDeg:                 tail.localDeg,
      leftWingUpperDeg:        lwu.localDeg,
      leftWingLowerDeg:        lwl.localDeg,
      rightWingUpperDeg:       rwu.localDeg,
      rightWingLowerDeg:       rwl.localDeg,
      eyeX:                    this.eyeX,
      eyeY:                    this.eyeY,
      flapPhase:               this._flapPhase,
      flapAmplitude:           this._wingAmplitude,
      notificationPulse:       this._notificationDecay,
      smoothedHeadingDeltaRad: smoothedDelta,
      windStrength:            windStrength,
    };
  }

  /** Reset all integrated state — call when the bird goes dormant. */
  reset(): void {
    this._headingSmoothed    = 0;
    this._bodyRoll           = 0;
    this._flapPhase          = 0;
    this._notificationDecay  = 0;
    this._wingAmplitude      = 0.4;
    this._wingFreq           = 2.5;
    this.eyeX                = 0;
    this.eyeY                = 0;
    this.rig.reset();
  }
}
