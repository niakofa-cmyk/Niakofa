/**
 * SankofaBird/Core/useAnimationMixer.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANKOFA MOTION ENGINE (SME) — Layer 5: Animation Mixer (React wrapper)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * React wrapper around the pure AnimationMixer spring math AND the new
 * MotionSolver kinematic chain.  Both systems run in the SAME
 * requestAnimationFrame loop so all physics advance at 60fps, completely
 * decoupled from React's render cycle.
 *
 * Architecture (from the Flutter SankofaMotionEngine widget pattern):
 *
 *   React render (Bird.tsx):
 *     1. buildFlightState()  → writes flightStateRef.current each render
 *     2. Computes spring targets → writes targetsRef.current
 *
 *   rAF tick (this hook):
 *     A. MotionSolver.step(flightStateRef, dt) → kinematic chain
 *        Writes --sme-* CSS custom properties (solver layer)
 *     B. stepMixer(statesRef, targetsRef, dt)  → spring smoothing
 *        Writes --mixer-* CSS custom properties (mixer layer)
 *
 * Writing directly to CSS vars on the rig element (NOT via setState) keeps
 * the 60fps loop off React's reconciler entirely — the only React re-renders
 * are when heading / speed / bank props change, which is much less frequent.
 *
 * Battery-saver / reduced-motion path:
 *   When `enabled` is false, the rAF loop is cancelled entirely.  Targets
 *   are written straight through as static values and the solver is skipped.
 *   The existing CSS `transition:` declarations act as a cheap fallback.
 */

import { useEffect, useRef } from "react";
import {
  MIXER_CHANNELS,
  createMixerStates,
  stepMixer,
  extractValues,
  type MixerChannel,
  type MixerTargets,
} from "./AnimationMixer";
import { SankofaRig }    from "./SankofaRig";
import { MotionSolver }  from "./MotionSolver";
import type { FlightState } from "./FlightState";

// ── CSS var maps ────────────────────────────────────────────────────────────

/** Maps each mixer channel to the CSS custom property it drives. */
const CHANNEL_CSS_VAR: Record<MixerChannel, string> = {
  bankDeg:           "--mixer-bank-deg",
  leanDeg:           "--mixer-lean-deg",
  headLeadDeg:       "--mixer-head-lead-deg",
  neckCurveDeg:      "--mixer-neck-curve-deg",
  bodyTwistDeg:      "--mixer-body-twist-deg",
  verticalGazeDeg:   "--mixer-vertical-gaze-deg",
  tailBendDeg:       "--mixer-tail-bend-deg",
  leftWingExtra:     "--mixer-left-wing-extra",
  rightWingExtra:    "--mixer-right-wing-extra",
  insideWingTuck:    "--mixer-inside-wing-tuck",
  screenRotationDeg: "--mixer-heading-deg",
};

/** Units to append after the numeric value for each channel. */
const CHANNEL_UNITS: Record<MixerChannel, string> = {
  bankDeg:           "deg",
  leanDeg:           "deg",
  headLeadDeg:       "deg",
  neckCurveDeg:      "deg",
  bodyTwistDeg:      "deg",
  verticalGazeDeg:   "deg",
  tailBendDeg:       "deg",
  leftWingExtra:     "deg",
  rightWingExtra:    "deg",
  insideWingTuck:    "",
  screenRotationDeg: "deg",
};

/**
 * CSS custom properties written by the MotionSolver (--sme-* namespace).
 * These supplement the --mixer-* vars with kinematic-chain–computed values.
 * Components can read them for fine-grained per-bone rotation effects.
 *
 * SME v2/v3 additions:
 *   windStrength — crosswind intensity [0..1], used by Phase 20 feather-ruffle
 *   aeroLoad — bounded speed/turn/wind load used by Phase 27 feathers
 */
export const SME_CSS_VARS = {
  headDeg:          "--sme-head-deg",
  neckUpperDeg:     "--sme-neck-upper-deg",
  neckLowerDeg:     "--sme-neck-lower-deg",
  bodyRollDeg:      "--sme-body-roll-deg",
  tailDeg:          "--sme-tail-deg",
  lwuDeg:           "--sme-lwing-upper-deg",
  lwlDeg:           "--sme-lwing-lower-deg",
  rwuDeg:           "--sme-rwing-upper-deg",
  rwlDeg:           "--sme-rwing-lower-deg",
  eyeX:             "--sme-eye-x",
  eyeY:             "--sme-eye-y",
  flapPhase:        "--sme-flap-phase",
  flapAmplitude:    "--sme-flap-amplitude",
  notificationPulse:"--sme-notification-pulse",
  headingDeltaDeg:  "--sme-heading-delta-deg",
  windStrength:     "--sme-wind-strength",
  aeroLoad:         "--sme-aero-load",
} as const;

// ── Hook interface ──────────────────────────────────────────────────────────

export interface UseAnimationMixerOptions {
  /** false = bypass the spring loop entirely (battery saver / reduced motion). */
  enabled?: boolean;
  /**
   * Optional FlightState ref.  When provided, the MotionSolver runs inside
   * the rAF tick and writes --sme-* CSS vars to the rig element.
   * When omitted, only the spring mixer runs (backward-compatible behaviour).
   */
  flightStateRef?: React.RefObject<FlightState | null>;
}

// ── useAnimationMixer ───────────────────────────────────────────────────────

export function useAnimationMixer(
  elRef: React.RefObject<HTMLElement | null>,
  targets: MixerTargets,
  options: UseAnimationMixerOptions = {},
): void {
  const { enabled = true, flightStateRef } = options;

  const statesRef  = useRef(createMixerStates(targets));
  const targetsRef = useRef(targets);
  targetsRef.current = targets; // always feed latest targets into the rAF loop

  // ── MotionSolver instances (created once, live for hook lifetime) ─────────
  // These are mutable class instances held in refs — they must NOT be
  // recreated on every render or the integrated state (body roll, flap phase)
  // would reset, causing a visible jump.
  const rigRef    = useRef<SankofaRig | null>(null);
  const solverRef = useRef<MotionSolver | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;

    // ── Battery-saver / reduced-motion bypass ───────────────────────────
    if (!enabled) {
      // Write targets straight through — no physics loop at all.
      for (const channel of MIXER_CHANNELS) {
        const units = CHANNEL_UNITS[channel];
        el.style.setProperty(
          CHANNEL_CSS_VAR[channel],
          `${targetsRef.current[channel] ?? 0}${units}`,
        );
      }
      return undefined;
    }

    // ── Lazily instantiate Rig + Solver on first enabled run ────────────
    if (!rigRef.current) {
      rigRef.current    = new SankofaRig();
      solverRef.current = new MotionSolver(rigRef.current);
    }

    let frameId: number;
    let lastTime = performance.now();

    function tick(now: number) {
      const dtMs = now - lastTime;
      lastTime   = now;

      const target = elRef.current;
      if (!target) {
        frameId = requestAnimationFrame(tick);
        return;
      }

      // ── A. MotionSolver tick (kinematic chain) ──────────────────────
      const fs = flightStateRef?.current;
      if (fs && solverRef.current) {
        const out = solverRef.current.step(fs, dtMs / 1000);

        // Write --sme-* CSS vars directly (no spring — the solver already
        // integrates smoothly via its own exponential filters)
        target.style.setProperty(SME_CSS_VARS.headDeg,           `${out.headDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.neckUpperDeg,      `${out.neckUpperDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.neckLowerDeg,      `${out.neckLowerDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.bodyRollDeg,       `${out.bodyRollDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.tailDeg,           `${out.tailDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.lwuDeg,            `${out.leftWingUpperDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.lwlDeg,            `${out.leftWingLowerDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.rwuDeg,            `${out.rightWingUpperDeg.toFixed(2)}deg`);
        target.style.setProperty(SME_CSS_VARS.rwlDeg,            `${out.rightWingLowerDeg.toFixed(2)}deg`);
        // Eye offset: scale solver output (SVG user units) → CSS px for the
        // `translate` CSS property applied to iris/pupil in Head.tsx.
        // At default size=64px with viewBox 0 0 40 40: 1 SVG unit ≈ 1.6 CSS px.
        // Scale 0.4 gives max ±0.6px (≈ 38% of the iris radius r=0.85 su × 1.6 ≈ 1.36px).
        // Tunable: increase for more expressive tracking, decrease for subtlety.
        target.style.setProperty(SME_CSS_VARS.eyeX,              `${(out.eyeX * 0.4).toFixed(3)}px`);
        target.style.setProperty(SME_CSS_VARS.eyeY,              `${(out.eyeY * 0.4).toFixed(3)}px`);
        // Flap phase (radians, unitless)
        target.style.setProperty(SME_CSS_VARS.flapPhase,         `${out.flapPhase.toFixed(4)}`);
        target.style.setProperty(SME_CSS_VARS.flapAmplitude,     `${out.flapAmplitude.toFixed(4)}`);
        target.style.setProperty(SME_CSS_VARS.notificationPulse, `${out.notificationPulse.toFixed(3)}`);
        target.style.setProperty(SME_CSS_VARS.headingDeltaDeg,   `${(out.smoothedHeadingDeltaRad * 180 / Math.PI).toFixed(2)}deg`);
        // SME v2/v3: wind strength for Phase 20 feather-ruffle CSS scaling
        target.style.setProperty(SME_CSS_VARS.windStrength,       `${out.windStrength.toFixed(3)}`);
        target.style.setProperty(SME_CSS_VARS.aeroLoad,            `${out.aeroLoad.toFixed(3)}`);
      }

      // ── B. Spring mixer tick ────────────────────────────────────────
      statesRef.current = stepMixer(statesRef.current, targetsRef.current, dtMs);
      const values = extractValues(statesRef.current);

      for (const channel of MIXER_CHANNELS) {
        const units = CHANNEL_UNITS[channel];
        target.style.setProperty(
          CHANNEL_CSS_VAR[channel],
          `${values[channel]}${units}`,
        );
      }

      // ── C. Dynamic neck cubic S-bezier — Phase 24 upgrade ─────────────
      //
      // Generates a CUBIC bezier each frame so the neck produces a genuine
      // S-curve as the bird looks left/right and up/down.  Quadratic bezier
      // (single control point) bows the whole neck in one direction; a cubic
      // (two independent control points) lets the lower neck curve one way
      // while the upper neck curves the other — the anatomically correct
      // S-shape a real bird shows when turning its head.
      //
      // Pivot constants (viewBox 0 0 40 40):
      //   NB = (18, 16) — neck base  (where neck meets body)
      //   HP = ( 8, 13) — head pivot (head center)
      //
      // Rest vector:  dx = -10,  dy = -3
      // Rest length:  ≈ 10.44
      // Perpendicular unit (90° CCW):  PX ≈ +0.287,  PY ≈ -0.958
      //
      // Cubic control point strategy:
      //   C1 (30% along rest vec, +bulge):   lower neck curves toward look dir
      //   C2 (70% along rest vec, -bulge*0.45): upper neck curves opposite (S)
      //
      // verticalGazeDeg: lifts/drops the mid-point of the neck so looking up
      // arches the neck upward and looking down droops it — adds a second
      // dimension to the S-curve (lateral + vertical).
      {
        const NB_X = 18, NB_Y = 16;
        const HP_X = 8,  HP_Y = 13;
        const DX   = HP_X - NB_X;    // -10
        const DY   = HP_Y - NB_Y;    //  -3
        const LEN  = Math.sqrt(DX * DX + DY * DY); // ≈10.44

        // Perpendicular unit vector (90° CCW from neck direction)
        const PX = -DY / LEN;  // ≈ +0.287
        const PY =  DX / LEN;  // ≈ -0.958

        // Vertical unit vector (in SVG: -Y is up)
        const VX = 0;
        const VY = -1;

        const headDeg  = values.headLeadDeg;      // spring-smoothed, sign-corrected
        const vertDeg  = values.verticalGazeDeg ?? 0; // up/down gaze
        const headRad  = headDeg  * (Math.PI / 180);
        const vertRad  = vertDeg  * (Math.PI / 180);

        // Lateral S-bulge: sin of head angle × fraction of neck length.
        // Phase 25 upgrade: 0.30 → 0.38 — more expressive S-curve during turns.
        // At ±90° this reaches 3.9 SVG units (was 3.1), making banking and
        // looking left/right visibly more fluid and graceful.
        const lateralBulge = Math.sin(headRad) * LEN * 0.38;

        // Vertical arc: sin of vertical gaze × fraction of neck length.
        // Phase 25 upgrade: 0.18 → 0.24 — looking up/down shows genuine neck arch.
        // Positive vertDeg = looking up → lift mid-neck upward (−Y in SVG)
        const verticalArc = Math.sin(vertRad) * LEN * 0.24;

        // Control point 1: 30% along neck from base — lower neck curves first
        const C1X = NB_X + DX * 0.30 + PX * lateralBulge       + VX * verticalArc;
        const C1Y = NB_Y + DY * 0.30 + PY * lateralBulge       + VY * verticalArc;

        // Control point 2: 70% along neck toward head — upper neck bends back (S).
        // Phase 25 upgrade: counter-factor 0.45 → 0.52 — tighter S-return curve,
        // so the neck doesn't bow monotonically but shows genuine S-shape tension.
        const C2X = NB_X + DX * 0.70 - PX * lateralBulge * 0.52 - VX * verticalArc * 0.60;
        const C2Y = NB_Y + DY * 0.70 - PY * lateralBulge * 0.52 - VY * verticalArc * 0.60;

        const dAttr = `M ${NB_X},${NB_Y} C ${C1X.toFixed(2)},${C1Y.toFixed(2)} ${C2X.toFixed(2)},${C2Y.toFixed(2)} ${HP_X},${HP_Y}`;

        const neckDyn = target.querySelector(".sankofa-neck-dynamic") as SVGPathElement | null;
        if (neckDyn) {
          neckDyn.setAttribute("d", dAttr);
          // Show the dynamic path (progressive enhancement).
          if (neckDyn.style.opacity !== "1") neckDyn.style.opacity = "1";

          // Also update the halo path (same d, wider stroke — styled in CSS)
          const neckHalo = target.querySelector(".sankofa-neck-dynamic-halo") as SVGPathElement | null;
          if (neckHalo) {
            neckHalo.setAttribute("d", dAttr);
            if (neckHalo.style.opacity !== "1") neckHalo.style.opacity = "1";
          }

          // Hide static fallback segments so the dynamic path is the only neck.
          target.querySelectorAll(".sankofa-neck-static").forEach((el) => {
            const e = el as SVGElement;
            if (e.style.opacity !== "0") e.style.opacity = "0";
          });
        }
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // Remount only when enabled or the rig ref changes.
    // targetsRef and flightStateRef are always read fresh inside the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, elRef]);
}
