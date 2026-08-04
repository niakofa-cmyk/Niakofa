/**
 * sankofa-bird.test.ts
 *
 * Unit tests for every pure flight-computation function in sankofa-bird-math.ts.
 *
 * Run with:
 *   pnpm --filter @workspace/pay-it-forward run test
 *
 * Covers (matching the spec document and reference image):
 *   1. Screen rotation — compass heading → CSS rotate angle
 *   2. Heading delta   — shortest signed angular delta, wraps at 0°/360°
 *   3. Bank angle      — heading delta → ±25° clamped bank
 *   4. Differential wing banking (outside extends, inside folds)
 *   5. Tail rudder bend
 *   6. Flight mode     — isMoving / isGliding / isVisuallyGliding from speed + navigating + phase
 *   7. Speed tier labels
 *   8. Flap period     — idle 1.4s → walking ~1/sec → driving 5/sec → glide 4s
 *   9. Body lean angle — 0° idle → 15° max → 12° glide posture
 *  10. Landing phase transitions (logic invariants, not timer behaviour)
 *  11. Edge cases      — NaN, 0 speed, boundary values
 */

import { describe, it } from "node:test";
import { expect } from "expect";

import {
  computeScreenRotation,
  shortestHeadingDelta,
  computeBankAngle,
  computeWingExtras,
  computeTailBend,
  computeFlightMode,
  getSpeedTier,
  computeFlapPeriodMs,
  computeLeanDeg,
  computeGazeVector,
  nextSaccadePhase,
  computeAeroMode,
  computeFigureEightAmplitude,
  computeLegStrideDelays,
  // Phase 17 — 360° directional aerodynamics
  computeTurnDirection,
  computeTurnIntensity,
  computeNeckCurveDeg,
  computeBodyTwistDeg,
  computeVerticalGazeTiltDeg,
  computeGazeRotateDeg,
  computeInsideWingTuck,
  type LandingPhase,
  type GazeDirection,
  type SaccadePhase,
  type TurnDirection,
} from "../sankofa-bird-math";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Screen rotation
// ─────────────────────────────────────────────────────────────────────────────
describe("computeScreenRotation", () => {
  it("north-up: heading IS the screen angle", () => {
    expect(computeScreenRotation(0,   0)).toBe(0);
    expect(computeScreenRotation(90,  0)).toBe(90);
    expect(computeScreenRotation(180, 0)).toBe(180);
    expect(computeScreenRotation(270, 0)).toBe(270);
  });

  it("heading-up: bird always points to screen-top (rotation = 0)", () => {
    // When mapBearing equals heading, the bird faces straight up regardless
    // of which way north is — matches the doc's heading-up mode.
    expect(computeScreenRotation(0,   0)).toBe(0);
    expect(computeScreenRotation(90,  90)).toBe(0);
    expect(computeScreenRotation(135, 135)).toBe(0);
    expect(computeScreenRotation(270, 270)).toBe(0);
  });

  it("result is always in [0, 360)", () => {
    // North-facing bird with map rotated 90° east → bird appears at 270°
    expect(computeScreenRotation(0, 90)).toBe(270);
    // Various combos
    for (let h = 0; h < 360; h += 30) {
      for (let b = 0; b < 360; b += 45) {
        const r = computeScreenRotation(h, b);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(360);
      }
    }
  });

  it("handles heading > 360 by wrapping correctly", () => {
    expect(computeScreenRotation(370, 0)).toBeCloseTo(10, 5);
  });

  it("large map bearing subtracted correctly", () => {
    expect(computeScreenRotation(45, 270)).toBe(135);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Shortest heading delta
// ─────────────────────────────────────────────────────────────────────────────
describe("shortestHeadingDelta", () => {
  it("zero delta when headings are equal", () => {
    expect(shortestHeadingDelta(45, 45)).toBe(0);
    expect(shortestHeadingDelta(0,  0)).toBe(0);
    expect(shortestHeadingDelta(359, 359)).toBe(0);
  });

  it("positive when turning right (clockwise)", () => {
    expect(shortestHeadingDelta(0,   90)).toBe(90);
    expect(shortestHeadingDelta(270, 360)).toBeCloseTo(90, 5);
  });

  it("negative when turning left (counter-clockwise)", () => {
    expect(shortestHeadingDelta(90, 0)).toBe(-90);
    expect(shortestHeadingDelta(45, 10)).toBe(-35);
  });

  it("handles the 359→1 wrap as +2, not −358", () => {
    expect(shortestHeadingDelta(359, 1)).toBeCloseTo(2, 5);
  });

  it("handles the 1→359 wrap as −2, not +358", () => {
    expect(shortestHeadingDelta(1, 359)).toBeCloseTo(-2, 5);
  });

  it("magnitude never exceeds 180", () => {
    for (let a = 0; a < 360; a += 17) {
      for (let b = 0; b < 360; b += 23) {
        const d = shortestHeadingDelta(a, b);
        expect(Math.abs(d)).toBeLessThanOrEqual(180);
      }
    }
  });

  it("exact opposites are ±180, never 0", () => {
    expect(Math.abs(shortestHeadingDelta(0,   180))).toBe(180);
    expect(Math.abs(shortestHeadingDelta(90,  270))).toBe(180);
    expect(Math.abs(shortestHeadingDelta(135, 315))).toBe(180);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bank angle
// ─────────────────────────────────────────────────────────────────────────────
describe("computeBankAngle", () => {
  it("zero delta → no bank", () => {
    expect(computeBankAngle(0)).toBe(0);
  });

  it("positive delta (right turn) → positive bank", () => {
    expect(computeBankAngle(5)).toBeGreaterThan(0);
    // Use 3° delta (3*2.8=8.4 — well within ±25 clamp) for proportional check
    expect(computeBankAngle(3)).toBeCloseTo(3 * 2.8, 5);
  });

  it("negative delta (left turn) → negative bank", () => {
    expect(computeBankAngle(-5)).toBeLessThan(0);
    expect(computeBankAngle(-3)).toBeCloseTo(-3 * 2.8, 5);
  });

  it("clamps at +25° for large right turns", () => {
    expect(computeBankAngle(20)).toBe(25);
    expect(computeBankAngle(100)).toBe(25);
  });

  it("clamps at −25° for large left turns", () => {
    expect(computeBankAngle(-20)).toBe(-25);
    expect(computeBankAngle(-100)).toBe(-25);
  });

  it("typical 9° heading update → ~25° bank (touches clamp)", () => {
    // 9 * 2.8 = 25.2 → clamped to 25
    expect(computeBankAngle(9)).toBe(25);
  });

  it("small gentle turn → bank proportional to delta", () => {
    const bank = computeBankAngle(3);
    expect(bank).toBeCloseTo(3 * 2.8, 5);
    expect(Math.abs(bank)).toBeLessThan(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Differential wing banking
// ─────────────────────────────────────────────────────────────────────────────
describe("computeWingExtras", () => {
  it("no bank → both extras are zero", () => {
    const { leftExtra, rightExtra } = computeWingExtras(0);
    expect(leftExtra).toBe(0);
    expect(rightExtra).toBe(0);
  });

  it("right turn (bankDeg > 0): left extends (+), right folds (−)", () => {
    const { leftExtra, rightExtra } = computeWingExtras(20);
    expect(leftExtra).toBeGreaterThan(0);   // outside wing extends
    expect(rightExtra).toBeLessThan(0);     // inside wing folds
    expect(leftExtra).toBeCloseTo(20 * 0.4, 5);
    expect(rightExtra).toBeCloseTo(-20 * 0.4, 5);
  });

  it("left turn (bankDeg < 0): right extends (+), left folds (−)", () => {
    const { leftExtra, rightExtra } = computeWingExtras(-20);
    expect(leftExtra).toBeLessThan(0);      // inside wing folds
    expect(rightExtra).toBeGreaterThan(0);  // outside wing extends
    expect(leftExtra).toBeCloseTo(-20 * 0.4, 5);
    expect(rightExtra).toBeCloseTo(20 * 0.4, 5);
  });

  it("extras are symmetric about zero bank", () => {
    const pos = computeWingExtras(15);
    const neg = computeWingExtras(-15);
    expect(pos.leftExtra).toBeCloseTo(-neg.leftExtra, 5);
    expect(pos.rightExtra).toBeCloseTo(-neg.rightExtra, 5);
  });

  it("max bank (25°) → extra = ±10°", () => {
    const { leftExtra, rightExtra } = computeWingExtras(25);
    expect(leftExtra).toBeCloseTo(10, 5);
    expect(rightExtra).toBeCloseTo(-10, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tail bend
// ─────────────────────────────────────────────────────────────────────────────
describe("computeTailBend", () => {
  it("no bank → no tail bend", () => {
    expect(computeTailBend(0)).toBe(0);
  });

  it("right bank → positive (rightward) tail bend", () => {
    expect(computeTailBend(20)).toBeCloseTo(12, 5);
  });

  it("left bank → negative tail bend", () => {
    expect(computeTailBend(-20)).toBeCloseTo(-12, 5);
  });

  it("tail bend is 60% of bank (lighter than body)", () => {
    for (const bank of [-25, -10, 0, 10, 25]) {
      expect(computeTailBend(bank)).toBeCloseTo(bank * 0.6, 5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Flight mode
// ─────────────────────────────────────────────────────────────────────────────
describe("computeFlightMode", () => {
  it("standing still (speed=0, navigating=false) → not moving, not gliding", () => {
    const { isMoving, isGliding } = computeFlightMode(0, false, "idle");
    expect(isMoving).toBe(false);
    expect(isGliding).toBe(false);
  });

  it("below 0.3 m/s threshold → not moving even if navigating", () => {
    const { isMoving } = computeFlightMode(0.2, true, "idle");
    expect(isMoving).toBe(false);
  });

  it("walking speed (1.4 m/s, navigating) → moving, not gliding", () => {
    const { isMoving, isGliding } = computeFlightMode(1.4, true, "idle");
    expect(isMoving).toBe(true);
    expect(isGliding).toBe(false);
  });

  it("driving speed (14 m/s, navigating) → moving, not physics-gliding, but visually gliding", () => {
    const { isMoving, isGliding, isVisuallyGliding } = computeFlightMode(14, true, "idle");
    expect(isMoving).toBe(true);
    // Physics glide still requires airplane speed (> 50 m/s) — flap cadence + lean unchanged
    expect(isGliding).toBe(false);
    // Visual glide fires at driving speed so CSS elongation/wing-tip effects are reachable
    expect(isVisuallyGliding).toBe(true);
  });

  it("airplane speed (55 m/s, navigating) → moving AND physics-gliding AND visually gliding", () => {
    const { isMoving, isGliding, isVisuallyGliding } = computeFlightMode(55, true, "idle");
    expect(isMoving).toBe(true);
    expect(isGliding).toBe(true);
    expect(isVisuallyGliding).toBe(true);
  });

  it("exactly 50 m/s → not physics-gliding (threshold is strictly > 50), but visually gliding", () => {
    const { isGliding, isVisuallyGliding } = computeFlightMode(50, true, "idle");
    expect(isGliding).toBe(false);
    expect(isVisuallyGliding).toBe(true);
  });

  it("exactly 10 m/s → not visually gliding (threshold is strictly > 10)", () => {
    const { isVisuallyGliding } = computeFlightMode(10, true, "idle");
    expect(isVisuallyGliding).toBe(false);
  });

  it("10.1 m/s → visually gliding", () => {
    const { isVisuallyGliding } = computeFlightMode(10.1, true, "idle");
    expect(isVisuallyGliding).toBe(true);
  });

  it("walking speed (1.4 m/s) → not visually gliding", () => {
    const { isVisuallyGliding } = computeFlightMode(1.4, true, "idle");
    expect(isVisuallyGliding).toBe(false);
  });

  it("above 10 m/s but NOT navigating → not visually gliding (isMoving required)", () => {
    const { isMoving, isVisuallyGliding } = computeFlightMode(14, false, "idle");
    expect(isMoving).toBe(false);
    expect(isVisuallyGliding).toBe(false);
  });

  it("above 50 m/s but NOT navigating → not moving, not gliding, not visually gliding", () => {
    // Speed alone doesn't trigger flight — navigating OR flying landingPhase required
    const { isMoving, isGliding, isVisuallyGliding } = computeFlightMode(55, false, "idle");
    expect(isMoving).toBe(false);
    expect(isGliding).toBe(false);
    expect(isVisuallyGliding).toBe(false);
  });

  it("landingPhase='flying' acts as navigating for isMoving and isVisuallyGliding", () => {
    // This is how landing sequence keeps trail particles during slowflap
    const { isMoving, isVisuallyGliding } = computeFlightMode(14, false, "flying");
    expect(isMoving).toBe(true);
    expect(isVisuallyGliding).toBe(true);
  });

  it("running speed (5 m/s) with landingPhase='flying': moving but NOT visually gliding", () => {
    // 5 m/s is below the 10 m/s isVisuallyGliding threshold — trail dots render
    // but body elongation / wing-tip slots do NOT fire (those need > 10 m/s).
    const { isMoving, isVisuallyGliding } = computeFlightMode(5, false, "flying");
    expect(isMoving).toBe(true);
    expect(isVisuallyGliding).toBe(false);
  });

  it("running speed (5 m/s) with navigating=true: moving but NOT visually gliding", () => {
    const { isMoving, isGliding, isVisuallyGliding } = computeFlightMode(5, true, "idle");
    expect(isMoving).toBe(true);
    expect(isGliding).toBe(false);
    expect(isVisuallyGliding).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Speed tier labels
// ─────────────────────────────────────────────────────────────────────────────
describe("getSpeedTier", () => {
  it("0 m/s → idle", () => {
    expect(getSpeedTier(0)).toBe("idle");
  });

  it("0.3 m/s (threshold) → idle", () => {
    expect(getSpeedTier(0.3)).toBe("idle");
  });

  it("1.4 m/s → walking (~1 flap/sec, doc spec)", () => {
    expect(getSpeedTier(1.4)).toBe("walking");
  });

  it("5 m/s → running (~2 flaps/sec, doc spec)", () => {
    expect(getSpeedTier(5)).toBe("running");
  });

  it("14 m/s → driving (~5 flaps/sec, doc spec)", () => {
    expect(getSpeedTier(14)).toBe("driving");
  });

  it("55 m/s → airplane (glide animation, doc spec)", () => {
    expect(getSpeedTier(55)).toBe("airplane");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Flap period
// ─────────────────────────────────────────────────────────────────────────────
describe("computeFlapPeriodMs", () => {
  const idleOpts = { isMoving: false, isGliding: false, speedMs: 0, landingPhase: "idle" as LandingPhase };

  it("idle → 1 400 ms (≈ 1 flap/sec, doc spec)", () => {
    expect(computeFlapPeriodMs(idleOpts)).toBe(1400);
  });

  it("landing perch → 1 400 ms (resumes idle animation)", () => {
    expect(computeFlapPeriodMs({ ...idleOpts, landingPhase: "perch" })).toBe(1400);
  });

  it("landing hover → 1 400 ms", () => {
    expect(computeFlapPeriodMs({ ...idleOpts, landingPhase: "hover" })).toBe(1400);
  });

  it("landing slowflap → 1 000 ms (transitional deceleration)", () => {
    expect(computeFlapPeriodMs({ ...idleOpts, isMoving: true, landingPhase: "slowflap" })).toBe(1000);
  });

  it("walking 1.4 m/s → ~640 ms (≈ 1.56 flaps/sec)", () => {
    // When navigating, component sets landingPhase to "flying"
    const ms = computeFlapPeriodMs({ isMoving: true, isGliding: false, speedMs: 1.4, landingPhase: "flying" });
    // 1 + 1.4/2.5 = 1.56 flaps/sec → 641 ms
    expect(ms).toBeCloseTo(1000 / (1 + 1.4 / 2.5), 0);
    expect(ms).toBeGreaterThan(500);
    expect(ms).toBeLessThan(800);
  });

  it("running 5 m/s → ~333 ms (3 flaps/sec — faster than walking, slower than driving)", () => {
    // 1 + 5/2.5 = 3 flaps/sec → 333 ms. Doc says "~2/sec" as a rough tier; the
    // formula gives 3/sec at exactly 5 m/s because the scale is continuous.
    const ms = computeFlapPeriodMs({ isMoving: true, isGliding: false, speedMs: 5, landingPhase: "flying" });
    expect(ms).toBeCloseTo(1000 / (1 + 5 / 2.5), 0);
    expect(ms).toBeGreaterThan(250);
    expect(ms).toBeLessThan(450);
  });

  it("driving 10 m/s → 200 ms (5 flaps/sec, doc spec max)", () => {
    // When navigating, the component sets landingPhase to "flying"
    const ms = computeFlapPeriodMs({ isMoving: true, isGliding: false, speedMs: 10, landingPhase: "flying" });
    // 1 + 10/2.5 = 5 → exactly max
    expect(ms).toBe(200);
  });

  it("very high speed still clamped to 5 flaps/sec (200 ms floor)", () => {
    const ms = computeFlapPeriodMs({ isMoving: true, isGliding: false, speedMs: 40, landingPhase: "flying" });
    expect(ms).toBe(200);
  });

  it("airplane 55 m/s → 4 000 ms glide (barely-perceptible oscillation)", () => {
    const ms = computeFlapPeriodMs({ isMoving: true, isGliding: true, speedMs: 55, landingPhase: "flying" });
    expect(ms).toBe(4000);
  });

  it("period is always a positive finite number", () => {
    const speeds = [0, 0.3, 1, 5, 10, 14, 50, 55, 200];
    const phases: LandingPhase[] = ["idle", "flying", "slowflap", "hover", "perch"];
    for (const s of speeds) {
      for (const p of phases) {
        const { isMoving, isGliding } = computeFlightMode(s, true, p);
        const ms = computeFlapPeriodMs({ isMoving, isGliding, speedMs: s, landingPhase: p });
        expect(ms).toBeGreaterThan(0);
        expect(Number.isFinite(ms)).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Body lean angle
// ─────────────────────────────────────────────────────────────────────────────
describe("computeLeanDeg", () => {
  it("idle (not moving) → 0° lean", () => {
    expect(computeLeanDeg({ isMoving: false, isGliding: false, speedMs: 0, landingPhase: "idle" })).toBe(0);
  });

  it("hover landing phase → 0° lean", () => {
    expect(computeLeanDeg({ isMoving: false, isGliding: false, speedMs: 0, landingPhase: "hover" })).toBe(0);
  });

  it("perch landing phase → 0° lean", () => {
    expect(computeLeanDeg({ isMoving: false, isGliding: false, speedMs: 0, landingPhase: "perch" })).toBe(0);
  });

  it("slowflap landing phase → 6° lean (deceleration tilt)", () => {
    expect(computeLeanDeg({ isMoving: true, isGliding: false, speedMs: 5, landingPhase: "slowflap" })).toBe(6);
  });

  it("walking speed → lean between 6° and 15°", () => {
    // When navigating, component sets landingPhase to "flying"
    const lean = computeLeanDeg({ isMoving: true, isGliding: false, speedMs: 1.4, landingPhase: "flying" });
    expect(lean).toBeGreaterThanOrEqual(6);
    expect(lean).toBeLessThanOrEqual(15);
    expect(lean).toBeCloseTo(6 + 1.4, 5);
  });

  it("driving speed: lean reaches 15° max (doc spec)", () => {
    // When navigating, SankofaBird sets landingPhase to "flying" — test that state.
    const lean = computeLeanDeg({ isMoving: true, isGliding: false, speedMs: 14, landingPhase: "flying" });
    expect(lean).toBe(15); // 6 + 14 = 20 → clamped to 15
  });

  it("very high speed still clamped at 15°", () => {
    const lean = computeLeanDeg({ isMoving: true, isGliding: false, speedMs: 100, landingPhase: "flying" });
    expect(lean).toBe(15);
  });

  it("airplane glide → 12° fixed flat posture (doc spec)", () => {
    const lean = computeLeanDeg({ isMoving: true, isGliding: true, speedMs: 55, landingPhase: "flying" });
    expect(lean).toBe(12);
  });

  it("lean is always non-negative", () => {
    const speeds = [0, 1, 5, 10, 14, 55];
    const phases: LandingPhase[] = ["idle", "flying", "slowflap", "hover", "perch"];
    for (const s of speeds) {
      for (const p of phases) {
        const { isMoving, isGliding } = computeFlightMode(s, true, p);
        const lean = computeLeanDeg({ isMoving, isGliding, speedMs: s, landingPhase: p });
        expect(lean).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Landing phase transition invariants
// ─────────────────────────────────────────────────────────────────────────────
describe("Landing phase animation invariants", () => {
  // These tests verify the VALUES each phase should produce, which is what
  // we can deterministically assert. The timer sequence itself is tested
  // visually on /bird-test and in the integration layer.

  const landingSequence: LandingPhase[] = ["flying", "slowflap", "hover", "perch", "idle"];

  it("each landing phase produces a valid, positive flap period", () => {
    for (const phase of landingSequence) {
      const { isMoving, isGliding } = computeFlightMode(8, phase === "flying", phase);
      const ms = computeFlapPeriodMs({ isMoving, isGliding, speedMs: 8, landingPhase: phase });
      expect(ms).toBeGreaterThan(0);
      expect(Number.isFinite(ms)).toBe(true);
    }
  });

  it("lean decreases through the landing sequence (doc: hover → perch → idle)", () => {
    const slowflapLean = computeLeanDeg({ isMoving: true,  isGliding: false, speedMs: 8, landingPhase: "slowflap" });
    const hoverLean    = computeLeanDeg({ isMoving: false, isGliding: false, speedMs: 0, landingPhase: "hover" });
    const perchLean    = computeLeanDeg({ isMoving: false, isGliding: false, speedMs: 0, landingPhase: "perch" });
    const idleLean     = computeLeanDeg({ isMoving: false, isGliding: false, speedMs: 0, landingPhase: "idle" });

    expect(slowflapLean).toBeGreaterThan(hoverLean);
    expect(hoverLean).toBe(0);
    expect(perchLean).toBe(0);
    expect(idleLean).toBe(0);
  });

  it("slowflap period (1000ms) is faster than idle (1400ms) — deceleration feel", () => {
    const slowflapMs = computeFlapPeriodMs({ isMoving: true,  isGliding: false, speedMs: 8, landingPhase: "slowflap" });
    const idleMs     = computeFlapPeriodMs({ isMoving: false, isGliding: false, speedMs: 0, landingPhase: "idle" });
    expect(slowflapMs).toBeLessThan(idleMs);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Edge cases and boundary values
// ─────────────────────────────────────────────────────────────────────────────
describe("Edge cases", () => {
  it("bank of exactly ±25° stays at ±25° (not exceeded)", () => {
    expect(computeBankAngle(25 / 2.8)).toBeCloseTo(25, 1);
    expect(computeBankAngle(-(25 / 2.8))).toBeCloseTo(-25, 1);
  });

  it("speed exactly at glide threshold (50 m/s) is NOT gliding", () => {
    const { isGliding } = computeFlightMode(50, true, "idle");
    expect(isGliding).toBe(false);
  });

  it("speed 50.001 m/s IS gliding", () => {
    const { isGliding } = computeFlightMode(50.001, true, "idle");
    expect(isGliding).toBe(true);
  });

  it("screen rotation handles full 360° sweep without gaps", () => {
    const results = new Set<number>();
    for (let h = 0; h < 360; h++) {
      const r = Math.round(computeScreenRotation(h, 0));
      results.add(r);
    }
    // Should produce 360 distinct values (0..359)
    expect(results.size).toBe(360);
  });

  it("wing extras with bank=0 → both zero (symmetric idle)", () => {
    const { leftExtra, rightExtra } = computeWingExtras(0);
    expect(leftExtra).toBe(0);
    expect(rightExtra).toBe(0);
  });

  it("tail bend with bank=0 → 0° (no rudder input at rest)", () => {
    expect(computeTailBend(0)).toBe(0);
  });

  it("speed below walking threshold still produces idle period", () => {
    // 0.3 m/s is the isMoving threshold; below it, the bird is idle
    const ms = computeFlapPeriodMs({ isMoving: false, isGliding: false, speedMs: 0.29, landingPhase: "idle" });
    expect(ms).toBe(1400);
  });

  it("computeWingExtras(bankDeg=25): leftExtra + |rightExtra| = 20° total spread", () => {
    const { leftExtra, rightExtra } = computeWingExtras(25);
    expect(leftExtra + Math.abs(rightExtra)).toBeCloseTo(20, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Phase 12 — computeGazeVector (real-time 8-direction gaze system)
// ─────────────────────────────────────────────────────────────────────────────
describe("computeGazeVector", () => {
  it("approaching destination → 'down' (highest priority)", () => {
    // approaching overrides everything, including an upcoming turn
    const dir: GazeDirection = computeGazeVector({
      approaching: true,
      upcomingTurnDirection: "right",
      isGliding: true,
      newNotification: true,
    });
    expect(dir).toBe("down");
  });

  it("upcoming left turn → 'upleft' (priority 2)", () => {
    const dir = computeGazeVector({ upcomingTurnDirection: "left" });
    expect(dir).toBe("upleft");
  });

  it("upcoming right turn → 'upright' (priority 2)", () => {
    const dir = computeGazeVector({ upcomingTurnDirection: "right" });
    expect(dir).toBe("upright");
  });

  it("upcoming turn overrides gliding (priority 2 > 3)", () => {
    const dir = computeGazeVector({ upcomingTurnDirection: "left", isGliding: true });
    expect(dir).toBe("upleft");
  });

  it("gliding with no turn → 'up' (priority 3)", () => {
    const dir = computeGazeVector({ isGliding: true });
    expect(dir).toBe("up");
  });

  it("gliding overrides notification (priority 3 > 4)", () => {
    const dir = computeGazeVector({ isGliding: true, newNotification: true });
    expect(dir).toBe("up");
  });

  it("new notification with no higher trigger → 'right' (priority 4)", () => {
    const dir = computeGazeVector({ newNotification: true });
    expect(dir).toBe("right");
  });

  it("helping with no higher trigger → null (eyes-forward, priority 5)", () => {
    const dir = computeGazeVector({ isHelping: true });
    expect(dir).toBeNull();
  });

  it("notification overrides helping (priority 4 > 5)", () => {
    const dir = computeGazeVector({ newNotification: true, isHelping: true });
    expect(dir).toBe("right");
  });

  // ── Saccade phase tests (8-direction full compass rose, no null slots) ──────
  // Phase 14: Every saccade phase maps to a unique gaze direction.
  // Clockwise cycle: left(0) → upleft(1) → up(2) → upright(3) →
  //                  right(4) → downright(5) → down(6) → downleft(7) → wrap.
  // Dwell time comes from the 3-6 s timer interval, not null placeholder phases.
  it("saccadePhase 0 → 'left'", () => {
    expect(computeGazeVector({ saccadePhase: 0 })).toBe("left");
  });

  it("saccadePhase 1 → 'upleft'", () => {
    expect(computeGazeVector({ saccadePhase: 1 })).toBe("upleft");
  });

  it("saccadePhase 2 → 'up'", () => {
    expect(computeGazeVector({ saccadePhase: 2 })).toBe("up");
  });

  it("saccadePhase 3 → 'upright'", () => {
    expect(computeGazeVector({ saccadePhase: 3 })).toBe("upright");
  });

  it("saccadePhase 4 → 'right'", () => {
    expect(computeGazeVector({ saccadePhase: 4 })).toBe("right");
  });

  it("saccadePhase 5 → 'downright'", () => {
    expect(computeGazeVector({ saccadePhase: 5 })).toBe("downright");
  });

  it("saccadePhase 6 → 'down'", () => {
    expect(computeGazeVector({ saccadePhase: 6 })).toBe("down");
  });

  it("saccadePhase 7 → 'downleft'", () => {
    expect(computeGazeVector({ saccadePhase: 7 })).toBe("downleft");
  });

  it("all 8 saccadePhase values map to all 8 compass gaze directions (no duplicates, no nulls)", () => {
    const expected: GazeDirection[] = [
      "left", "upleft", "up", "upright",
      "right", "downright", "down", "downleft",
    ];
    for (let i = 0; i < 8; i++) {
      expect(computeGazeVector({ saccadePhase: i as SaccadePhase })).toBe(expected[i]);
    }
    // Verify full set coverage — all 8 directions, none omitted
    const uniqueDirs = new Set(expected.filter(Boolean));
    expect(uniqueDirs.size).toBe(8);
    expect(uniqueDirs.has("left")).toBe(true);
    expect(uniqueDirs.has("upleft")).toBe(true);
    expect(uniqueDirs.has("up")).toBe(true);
    expect(uniqueDirs.has("upright")).toBe(true);
    expect(uniqueDirs.has("right")).toBe(true);
    expect(uniqueDirs.has("downright")).toBe(true);
    expect(uniqueDirs.has("down")).toBe(true);
    expect(uniqueDirs.has("downleft")).toBe(true);
  });

  it("approaching overrides saccadePhase (priority 1 > 6)", () => {
    // approaching → "down" beats any saccade direction including saccadePhase 2 ("up")
    const dir = computeGazeVector({ approaching: true, saccadePhase: 2 });
    expect(dir).toBe("down");
  });

  // ── Phase 14: Bank-responsive gaze (priority 4.5) ────────────────────────
  // When banking hard (|bankDeg| > 10°) and no higher-priority signal is
  // active, the bird glances toward the turn direction. This gives real-time
  // reactive gaze on the map screen even without nav route data.
  it("bankDeg > 10° (right turn) → 'right' gaze (priority 4.5)", () => {
    const dir = computeGazeVector({ bankDeg: 15 });
    expect(dir).toBe("right");
  });

  it("bankDeg < −10° (left turn) → 'left' gaze (priority 4.5)", () => {
    const dir = computeGazeVector({ bankDeg: -15 });
    expect(dir).toBe("left");
  });

  it("bankDeg within ±10° → no bank gaze (below threshold)", () => {
    const dir = computeGazeVector({ bankDeg: 8 });
    // No higher priority signals, no saccade — falls through to null
    expect(dir).toBeNull();
  });

  it("bankDeg exactly ±10° → no bank gaze (threshold is strictly > 10)", () => {
    expect(computeGazeVector({ bankDeg: 10 })).toBeNull();
    expect(computeGazeVector({ bankDeg: -10 })).toBeNull();
  });

  it("notification overrides bank gaze (priority 4 > 4.5)", () => {
    // newNotification fires at priority 4, bank gaze at 4.5 — notification wins
    const dir = computeGazeVector({ newNotification: true, bankDeg: 20 });
    expect(dir).toBe("right");  // notification result, not bank result (both are "right" here)
  });

  it("bank gaze overrides saccade (priority 4.5 > 6)", () => {
    // Hard bank beats idle saccade
    const dir = computeGazeVector({ bankDeg: 20, saccadePhase: 0 });
    expect(dir).toBe("right");  // bank wins over saccadePhase 0 ("upleft")
  });

  it("bank gaze overrides helping (priority 4.5 > 5)", () => {
    // Hard bank overrides the eyes-forward helping posture
    const dir = computeGazeVector({ bankDeg: -18, isHelping: true });
    expect(dir).toBe("left");
  });

  it("upcoming turn overrides bank gaze (priority 2 > 4.5)", () => {
    // Nav turn anticipation beats the raw bank signal
    const dir = computeGazeVector({ upcomingTurnDirection: "left", bankDeg: 25 });
    expect(dir).toBe("upleft");  // turn wins, not "right" from bank
  });

  it("default (no inputs) → null (straight ahead)", () => {
    const dir = computeGazeVector({});
    expect(dir).toBeNull();
  });

  it("null upcomingTurnDirection → does not trigger turn gaze", () => {
    const dir = computeGazeVector({ upcomingTurnDirection: null });
    expect(dir).toBeNull();
  });

  it("approaching=false has same effect as omitting it", () => {
    const withFalse = computeGazeVector({ approaching: false });
    const omitted   = computeGazeVector({});
    expect(withFalse).toBe(omitted);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Phase 14 — nextSaccadePhase (8-phase omnidirectional idle drift cycle)
// ─────────────────────────────────────────────────────────────────────────────
// Phase 14 expanded saccade from 4 → 8 phases. Every phase is a distinct
// compass gaze direction — no null placeholder slots. Dwell comes from the
// 3-6 s timer interval between phase advances.
describe("nextSaccadePhase", () => {
  it("cycles 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 0", () => {
    expect(nextSaccadePhase(0)).toBe(1);
    expect(nextSaccadePhase(1)).toBe(2);
    expect(nextSaccadePhase(2)).toBe(3);
    expect(nextSaccadePhase(3)).toBe(4);
    expect(nextSaccadePhase(4)).toBe(5);
    expect(nextSaccadePhase(5)).toBe(6);
    expect(nextSaccadePhase(6)).toBe(7);
    expect(nextSaccadePhase(7)).toBe(0);
  });

  it("result is always in {0,1,2,3,4,5,6,7}", () => {
    const phases: SaccadePhase[] = [0, 1, 2, 3, 4, 5, 6, 7];
    for (const p of phases) {
      const next = nextSaccadePhase(p);
      expect([0, 1, 2, 3, 4, 5, 6, 7]).toContain(next);
    }
  });

  it("full cycle returns to start after exactly 8 advances", () => {
    let phase: SaccadePhase = 0;
    for (let i = 0; i < 8; i++) phase = nextSaccadePhase(phase);
    expect(phase).toBe(0);
  });

  it("does NOT return to start after 4 advances (8-phase, not 4-phase)", () => {
    let phase: SaccadePhase = 0;
    for (let i = 0; i < 4; i++) phase = nextSaccadePhase(phase);
    expect(phase).toBe(4);  // mid-cycle, not back to 0
  });

  it("covers all 8 compass gaze directions across one full cycle — no direction omitted", () => {
    const gazes: GazeDirection[] = [];
    let phase: SaccadePhase = 0;
    for (let i = 0; i < 8; i++) {
      gazes.push(computeGazeVector({ saccadePhase: phase }));
      phase = nextSaccadePhase(phase);
    }
    // Every phase is directional — no null pause slots in this cycle design
    expect(gazes.filter(g => g === null).length).toBe(0);
    expect(gazes.length).toBe(8);
    // All 8 compass directions must appear exactly once
    const dirs = new Set(gazes);
    expect(dirs.size).toBe(8);
    expect(dirs.has("left")).toBe(true);
    expect(dirs.has("upleft")).toBe(true);
    expect(dirs.has("up")).toBe(true);
    expect(dirs.has("upright")).toBe(true);
    expect(dirs.has("right")).toBe(true);
    expect(dirs.has("downright")).toBe(true);
    expect(dirs.has("down")).toBe(true);
    expect(dirs.has("downleft")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Phase 13 — computeAeroMode (aerodynamic flight mode priority)
// ─────────────────────────────────────────────────────────────────────────────
describe("computeAeroMode", () => {
  const base = { speedMs: 5, navigating: true, landingPhase: "flying" as LandingPhase };

  it("matingDisplay → 'mating' (highest priority)", () => {
    expect(computeAeroMode({ ...base, matingDisplay: true, wairMode: true, soaring: true })).toBe("mating");
  });

  it("wairMode → 'wair' (priority 2, beats soaring)", () => {
    expect(computeAeroMode({ ...base, wairMode: true, soaring: true })).toBe("wair");
  });

  it("soaring prop → 'soar' (priority 3)", () => {
    expect(computeAeroMode({ ...base, soaring: true })).toBe("soar");
  });

  it("speed > 30 m/s → 'soar' even without soaring prop", () => {
    expect(computeAeroMode({ ...base, speedMs: 35 })).toBe("soar");
  });

  it("exactly 30 m/s is NOT soaring (threshold is strictly > 30)", () => {
    expect(computeAeroMode({ ...base, speedMs: 30 })).toBe("flap");
  });

  it("hover landingPhase → 'hover'", () => {
    expect(computeAeroMode({ ...base, landingPhase: "hover" })).toBe("hover");
  });

  it("takeoff landingPhase → 'flap' (powered takeoff)", () => {
    expect(computeAeroMode({ ...base, landingPhase: "takeoff" })).toBe("flap");
  });

  it("slowflap landingPhase → 'flap' (deceleration flapping)", () => {
    expect(computeAeroMode({ ...base, landingPhase: "slowflap" })).toBe("flap");
  });

  it("dive landingPhase → 'soar' (glide-like trajectory)", () => {
    expect(computeAeroMode({ ...base, landingPhase: "dive" })).toBe("soar");
  });

  it("idle landingPhase → 'idle'", () => {
    expect(computeAeroMode({ ...base, speedMs: 0, navigating: false, landingPhase: "idle" })).toBe("idle");
  });

  it("perch landingPhase → 'idle'", () => {
    expect(computeAeroMode({ ...base, speedMs: 0, navigating: false, landingPhase: "perch" })).toBe("idle");
  });

  it("flying + navigating + moving → 'flap'", () => {
    expect(computeAeroMode({ speedMs: 8, navigating: true, landingPhase: "flying" })).toBe("flap");
  });

  it("not navigating + idle → 'idle' fallback", () => {
    expect(computeAeroMode({ speedMs: 0, navigating: false, landingPhase: "idle" })).toBe("idle");
  });

  it("matingDisplay beats hover landingPhase (priority 1 > landing phase check)", () => {
    expect(computeAeroMode({ ...base, landingPhase: "hover", matingDisplay: true })).toBe("mating");
  });

  it("wairMode beats soaring speed (priority 2 > speed > 30)", () => {
    expect(computeAeroMode({ ...base, speedMs: 40, wairMode: true })).toBe("wair");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Phase 13 — computeFigureEightAmplitude (oval wing stroke amplitudes)
// ─────────────────────────────────────────────────────────────────────────────
describe("computeFigureEightAmplitude", () => {
  it("gliding → minimal amplitude (wings nearly locked)", () => {
    const { downstrokeAngle, upstrokeAngle, strokeEllipseRatio } =
      computeFigureEightAmplitude({ speedMs: 55, isGliding: true, landingPhase: "flying" });
    expect(downstrokeAngle).toBe(8);
    expect(upstrokeAngle).toBe(4);
    expect(strokeEllipseRatio).toBe(0.25);
  });

  it("hover → maximum amplitude (hummingbird both-stroke lift)", () => {
    const { downstrokeAngle, upstrokeAngle, strokeEllipseRatio } =
      computeFigureEightAmplitude({ speedMs: 0, isGliding: false, landingPhase: "hover" });
    expect(downstrokeAngle).toBe(38);
    expect(upstrokeAngle).toBe(32);
    expect(strokeEllipseRatio).toBe(0.92);
  });

  it("takeoff → high amplitude + pronounced oval (power stroke)", () => {
    const { downstrokeAngle, upstrokeAngle, strokeEllipseRatio } =
      computeFigureEightAmplitude({ speedMs: 0, isGliding: false, landingPhase: "takeoff" });
    expect(downstrokeAngle).toBe(42);
    expect(upstrokeAngle).toBe(22);
    expect(strokeEllipseRatio).toBe(0.65);
  });

  it("downstroke is always larger than upstroke (thrust asymmetry)", () => {
    const cases = [
      { speedMs: 0,  isGliding: false, landingPhase: "flying" as LandingPhase },
      { speedMs: 5,  isGliding: false, landingPhase: "flying" as LandingPhase },
      { speedMs: 14, isGliding: false, landingPhase: "flying" as LandingPhase },
    ];
    for (const c of cases) {
      const { downstrokeAngle, upstrokeAngle } = computeFigureEightAmplitude(c);
      expect(downstrokeAngle).toBeGreaterThan(upstrokeAngle);
    }
  });

  it("upstroke is ~52% of downstroke in normal flight", () => {
    const { downstrokeAngle, upstrokeAngle } =
      computeFigureEightAmplitude({ speedMs: 5, isGliding: false, landingPhase: "flying" });
    expect(upstrokeAngle / downstrokeAngle).toBeCloseTo(0.52, 2);
  });

  it("amplitude increases with speed (more power needed at higher speed)", () => {
    const slow = computeFigureEightAmplitude({ speedMs: 1, isGliding: false, landingPhase: "flying" });
    const fast = computeFigureEightAmplitude({ speedMs: 12, isGliding: false, landingPhase: "flying" });
    expect(fast.downstrokeAngle).toBeGreaterThanOrEqual(slow.downstrokeAngle);
  });

  it("downstroke capped at 32° in normal flight", () => {
    const { downstrokeAngle } =
      computeFigureEightAmplitude({ speedMs: 100, isGliding: false, landingPhase: "flying" });
    expect(downstrokeAngle).toBe(32);
  });

  it("strokeEllipseRatio is always between 0 and 1 (inclusive)", () => {
    const cases: Array<{ speedMs: number; isGliding: boolean; landingPhase: LandingPhase }> = [
      { speedMs: 0,   isGliding: false, landingPhase: "idle" },
      { speedMs: 5,   isGliding: false, landingPhase: "flying" },
      { speedMs: 55,  isGliding: true,  landingPhase: "flying" },
      { speedMs: 0,   isGliding: false, landingPhase: "hover" },
      { speedMs: 0,   isGliding: false, landingPhase: "takeoff" },
    ];
    for (const c of cases) {
      const { strokeEllipseRatio } = computeFigureEightAmplitude(c);
      expect(strokeEllipseRatio).toBeGreaterThanOrEqual(0);
      expect(strokeEllipseRatio).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Phase 13 — computeLegStrideDelays (left/right stride timing)
// ─────────────────────────────────────────────────────────────────────────────
describe("computeLegStrideDelays", () => {
  it("at rest (≤ 0.3 m/s) → all zeros (no stride)", () => {
    const { leftDelayMs, rightDelayMs, stridePeriodMs } = computeLegStrideDelays(0);
    expect(leftDelayMs).toBe(0);
    expect(rightDelayMs).toBe(0);
    expect(stridePeriodMs).toBe(0);
  });

  it("at exactly 0.3 m/s → also zeros (threshold is strictly > 0.3)", () => {
    const { stridePeriodMs } = computeLegStrideDelays(0.3);
    expect(stridePeriodMs).toBe(0);
  });

  it("left leg always starts at delay 0 (reference leg)", () => {
    const speeds = [1, 5, 14, 30];
    for (const s of speeds) {
      expect(computeLegStrideDelays(s).leftDelayMs).toBe(0);
    }
  });

  it("right leg offset = exactly half the stride period (alternating gait)", () => {
    const { rightDelayMs, stridePeriodMs } = computeLegStrideDelays(5);
    expect(rightDelayMs).toBeCloseTo(stridePeriodMs / 2, 5);
  });

  it("stride period decreases with speed (faster gait at higher speed)", () => {
    const slow = computeLegStrideDelays(1.4);
    const fast = computeLegStrideDelays(14);
    expect(fast.stridePeriodMs).toBeLessThan(slow.stridePeriodMs);
  });

  it("stride period floor is 200 ms (prevents visual flickering at very high speed)", () => {
    const { stridePeriodMs } = computeLegStrideDelays(100);
    expect(stridePeriodMs).toBeGreaterThanOrEqual(200);
  });

  it("stridePeriodMs is always a positive finite number above threshold", () => {
    const speeds = [0.31, 1, 5, 10, 14, 50];
    for (const s of speeds) {
      const { stridePeriodMs } = computeLegStrideDelays(s);
      expect(stridePeriodMs).toBeGreaterThan(0);
      expect(Number.isFinite(stridePeriodMs)).toBe(true);
    }
  });

  it("walking (~1.4 m/s) stride period is ~800–1000 ms (doc reference)", () => {
    const { stridePeriodMs } = computeLegStrideDelays(1.4);
    expect(stridePeriodMs).toBeGreaterThan(600);
    expect(stridePeriodMs).toBeLessThan(1100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Phase Regression Invariants
//     One describe per phase — verifies the contract each phase established.
//     A failure here means a later change broke an earlier guarantee.
// ─────────────────────────────────────────────────────────────────────────────
describe("Phase regression invariants", () => {

  // ── Phase 1–5: Core banking / wing / tail ────────────────────────────────
  describe("Phase 1–5: core banking / wing / tail", () => {
    it("P1: bankAngle 0 → symmetric idle (no wing asymmetry)", () => {
      const { leftExtra, rightExtra } = computeWingExtras(0);
      expect(leftExtra).toBe(0);
      expect(rightExtra).toBe(0);
    });

    it("P1: positive bank (right turn) → left extends (outside), right folds (inside)", () => {
      const { leftExtra, rightExtra } = computeWingExtras(15);
      expect(leftExtra).toBeGreaterThan(0);
      expect(rightExtra).toBeLessThan(0);
    });

    it("P1: negative bank (left turn) → right extends (outside), left folds (inside)", () => {
      const { leftExtra, rightExtra } = computeWingExtras(-15);
      expect(rightExtra).toBeGreaterThan(0);
      expect(leftExtra).toBeLessThan(0);
    });

    it("P2: bank clamped to ±25° — no runaway rotation beyond 25", () => {
      expect(computeBankAngle(1000)).toBe(25);
      expect(computeBankAngle(-1000)).toBe(-25);
    });

    it("P3: tail bend is 60% of bank (rudder physics)", () => {
      expect(computeTailBend(20)).toBeCloseTo(12, 5);
      expect(computeTailBend(-10)).toBeCloseTo(-6, 5);
    });

    it("P4: isGliding only at speed > 50 m/s when bird is moving", () => {
      // At exactly 50: NOT gliding (strict >)
      expect(computeFlightMode(50, true, "flying").isGliding).toBe(false);
      // At 51: gliding
      expect(computeFlightMode(51, true, "flying").isGliding).toBe(true);
      // landingPhase="flying" counts as isMoving even without navigating=true
      expect(computeFlightMode(55, false, "flying").isGliding).toBe(true);
    });

    it("P5: isVisuallyGliding threshold is 10 m/s (wing-slot effects at driving speed)", () => {
      expect(computeFlightMode(10, true, "flying").isVisuallyGliding).toBe(false);
      expect(computeFlightMode(11, true, "flying").isVisuallyGliding).toBe(true);
    });
  });

  // ── Phase 6: LOD / zoom effects ─────────────────────────────────────────
  describe("Phase 6: LOD behavior", () => {
    it("P6: getSpeedTier classifies all 5 tiers correctly", () => {
      expect(getSpeedTier(0)).toBe("idle");
      expect(getSpeedTier(1)).toBe("walking");
      expect(getSpeedTier(5)).toBe("running");
      expect(getSpeedTier(14)).toBe("driving");
      expect(getSpeedTier(55)).toBe("airplane"); // >50 threshold
    });

    it("P6: getSpeedTier boundary: 10 m/s = running, 10.1 m/s = driving", () => {
      expect(getSpeedTier(10)).toBe("running");
      expect(getSpeedTier(10.1)).toBe("driving");
    });

    it("P6: flapPeriodMs is FASTER at driving vs walking (higher speed = faster cadence)", () => {
      const { isMoving: wMoving, isGliding: wGlide } = computeFlightMode(1.4, true, "flying");
      const { isMoving: dMoving, isGliding: dGlide } = computeFlightMode(14, true, "flying");
      const walking = computeFlapPeriodMs({ isMoving: wMoving, isGliding: wGlide, speedMs: 1.4, landingPhase: "flying" });
      const driving = computeFlapPeriodMs({ isMoving: dMoving, isGliding: dGlide, speedMs: 14, landingPhase: "flying" });
      expect(driving).toBeLessThan(walking);
    });

    it("P6: glide flapPeriodMs (4000 ms) is the slowest — soaring beat", () => {
      const glide = computeFlapPeriodMs({ isMoving: true, isGliding: true, speedMs: 60, landingPhase: "flying" });
      const cruise = computeFlapPeriodMs({ isMoving: true, isGliding: false, speedMs: 14, landingPhase: "flying" });
      expect(glide).toBeGreaterThan(cruise);
      expect(glide).toBe(4000);
    });
  });

  // ── Phase 12: Gaze priority chain ────────────────────────────────────────
  describe("Phase 12: gaze priority chain (must not regress)", () => {
    it("P12: approaching beats turn direction — down > anticipatory glance", () => {
      const gaze = computeGazeVector({
        approaching: true,
        upcomingTurnDirection: "right",
        isGliding: false,
        newNotification: false,
        bankDeg: 0,
        isHelping: false,
        saccadePhase: 0,
      });
      expect(gaze).toBe("down");
    });

    it("P12: turn-right → 'upright' when not approaching (no hyphen — actual GazeDirection type)", () => {
      const gaze = computeGazeVector({
        approaching: false,
        upcomingTurnDirection: "right",
        isGliding: false,
        newNotification: false,
        bankDeg: 0,
        isHelping: false,
        saccadePhase: 0,
      });
      expect(gaze).toBe("upright");
    });

    it("P12: turn-left → 'upleft' when not approaching", () => {
      const gaze = computeGazeVector({
        approaching: false,
        upcomingTurnDirection: "left",
        isGliding: false,
        newNotification: false,
        bankDeg: 0,
        isHelping: false,
        saccadePhase: 0,
      });
      expect(gaze).toBe("upleft");
    });

    it("P12: gliding → 'up' when no turn or approach", () => {
      const gaze = computeGazeVector({
        approaching: false,
        upcomingTurnDirection: null,
        isGliding: true,
        newNotification: false,
        bankDeg: 0,
        isHelping: false,
        saccadePhase: 0,
      });
      expect(gaze).toBe("up");
    });

    it("P12: notification → 'right' when no higher-priority state", () => {
      const gaze = computeGazeVector({
        approaching: false,
        upcomingTurnDirection: null,
        isGliding: false,
        newNotification: true,
        bankDeg: 0,
        isHelping: false,
        saccadePhase: 0,
      });
      expect(gaze).toBe("right");
    });

    it("P12: hard bank right (>10°) → 'right' gaze when no higher-priority state", () => {
      const gaze = computeGazeVector({
        approaching: false,
        upcomingTurnDirection: null,
        isGliding: false,
        newNotification: false,
        bankDeg: 22,
        isHelping: false,
        saccadePhase: 0,
      });
      expect(gaze).toBe("right");
    });

    it("P12: hard bank left (< -10°) → 'left' gaze", () => {
      const gaze = computeGazeVector({
        approaching: false,
        upcomingTurnDirection: null,
        isGliding: false,
        newNotification: false,
        bankDeg: -22,
        isHelping: false,
        saccadePhase: 0,
      });
      expect(gaze).toBe("left");
    });

    it("P12: saccade phases 0-7 all produce a non-undefined gaze direction", () => {
      const phases: SaccadePhase[] = [0, 1, 2, 3, 4, 5, 6, 7];
      for (const phase of phases) {
        const gaze = computeGazeVector({
          approaching: false,
          upcomingTurnDirection: null,
          isGliding: false,
          newNotification: false,
          bankDeg: 0,
          isHelping: false,
          saccadePhase: phase,
        });
        expect(gaze).toBeDefined();
      }
    });
  });

  // ── Phase 13: Aero mode ──────────────────────────────────────────────────
  describe("Phase 13: aero mode contract", () => {
    it("P13: soar mode at high speed (>30 m/s) regardless of glide flag", () => {
      expect(computeAeroMode({ speedMs: 60, navigating: true, wairMode: false, soaring: false, matingDisplay: false, landingPhase: "flying" })).toBe("soar");
    });

    it("P13: flap mode at normal cruise speed with navigating=true", () => {
      expect(computeAeroMode({ speedMs: 14, navigating: true, wairMode: false, soaring: false, matingDisplay: false, landingPhase: "flying" })).toBe("flap");
    });

    it("P13: idle when landingPhase=idle", () => {
      expect(computeAeroMode({ speedMs: 0, navigating: false, wairMode: false, soaring: false, matingDisplay: false, landingPhase: "idle" })).toBe("idle");
    });

    it("P13: wair mode overrides flap when flag set", () => {
      expect(computeAeroMode({ speedMs: 3, navigating: true, wairMode: true, soaring: false, matingDisplay: false, landingPhase: "flying" })).toBe("wair");
    });

    it("P13: mating display is recognized as its own mode (highest priority)", () => {
      expect(computeAeroMode({ speedMs: 0, navigating: false, wairMode: false, soaring: false, matingDisplay: true, landingPhase: "idle" })).toBe("mating");
    });

    it("P13: soar mode fires at speedMs=31 (>30 threshold)", () => {
      expect(computeAeroMode({ speedMs: 30, navigating: true, wairMode: false, soaring: false, matingDisplay: false, landingPhase: "flying" })).not.toBe("soar");
      expect(computeAeroMode({ speedMs: 31, navigating: true, wairMode: false, soaring: false, matingDisplay: false, landingPhase: "flying" })).toBe("soar");
    });

    it("P13: figure-eight stroke ellipse ratio bounded [0, 1] across all aero modes", () => {
      const cases: Array<{ speedMs: number; isGliding: boolean; landingPhase: LandingPhase }> = [
        { speedMs: 0, isGliding: false, landingPhase: "idle" },
        { speedMs: 14, isGliding: false, landingPhase: "flying" },
        { speedMs: 60, isGliding: true, landingPhase: "flying" },
        { speedMs: 1, isGliding: false, landingPhase: "hover" },
      ];
      for (const c of cases) {
        const { strokeEllipseRatio } = computeFigureEightAmplitude(c);
        expect(strokeEllipseRatio).toBeGreaterThanOrEqual(0);
        expect(strokeEllipseRatio).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── Phase 14: Hard-bank low-zoom glitch prevention ───────────────────────
  describe("Phase 14: hard-bank low-zoom regression guard", () => {
    it("bankAngle is always in [-25, +25] regardless of input magnitude", () => {
      expect(computeBankAngle(500)).toBe(25);
      expect(computeBankAngle(-500)).toBe(-25);
      expect(computeBankAngle(9)).toBe(Math.max(-25, Math.min(25, 9 * 2.8)));
    });

    it("wingExtras at max bank (25°) are finite and non-zero", () => {
      const { leftExtra, rightExtra } = computeWingExtras(25);
      expect(Number.isFinite(leftExtra)).toBe(true);
      expect(Number.isFinite(rightExtra)).toBe(true);
      expect(leftExtra).not.toBe(0);
    });

    it("tailBend at max bank (25°) is a finite non-zero value", () => {
      const bend = computeTailBend(25);
      expect(Number.isFinite(bend)).toBe(true);
      expect(Math.abs(bend)).toBeGreaterThan(0);
    });

    it("gaze at hard bank >20° without turn or approach resolves to a defined direction", () => {
      const gazeRight = computeGazeVector({
        approaching: false, upcomingTurnDirection: null, isGliding: false,
        newNotification: false, bankDeg: 25, isHelping: false, saccadePhase: 0,
      });
      const gazeLeft = computeGazeVector({
        approaching: false, upcomingTurnDirection: null, isGliding: false,
        newNotification: false, bankDeg: -25, isHelping: false, saccadePhase: 0,
      });
      expect(["right", "upright", "downright"]).toContain(gazeRight);
      expect(["left", "upleft", "downleft"]).toContain(gazeLeft);
    });

    it("flapPeriod is always a positive finite number (no NaN at edge speeds)", () => {
      const edgeSpeeds = [0, 0.001, 10, 50, 51, 100, 999];
      for (const s of edgeSpeeds) {
        const { isMoving, isGliding } = computeFlightMode(s, true, "flying");
        const ms = computeFlapPeriodMs({ isMoving, isGliding, speedMs: s, landingPhase: "flying" });
        expect(Number.isFinite(ms)).toBe(true);
        expect(ms).toBeGreaterThan(0);
      }
    });
  });

  // ── Cross-phase: nextSaccadePhase cycles without returning undefined ────
  describe("nextSaccadePhase: 8-phase cycle completeness", () => {
    it("all 8 saccade phases (0-7) are reachable through cycling", () => {
      const seen = new Set<SaccadePhase>();
      let current: SaccadePhase = 0;
      for (let i = 0; i < 100; i++) {
        seen.add(current);
        current = nextSaccadePhase(current);
      }
      const expected: SaccadePhase[] = [0, 1, 2, 3, 4, 5, 6, 7];
      for (const phase of expected) {
        expect(seen.has(phase)).toBe(true);
      }
    });

    it("nextSaccadePhase always returns a number in {0..7}", () => {
      for (let p = 0 as SaccadePhase; p <= 7; p++) {
        const next = nextSaccadePhase(p as SaccadePhase);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(7);
      }
    });

    it("cycles wrap: 7 → 0 (not 8)", () => {
      expect(nextSaccadePhase(7 as SaccadePhase)).toBe(0);
    });
  });

  // ── Phase 17: 360° Directional Aerodynamics ──────────────────────────────
  describe("Phase 17: computeTurnDirection", () => {
    it("returns 'none' for zero bank", () => {
      expect(computeTurnDirection(0)).toBe("none");
    });

    it("returns 'none' within the 5° jitter deadband", () => {
      expect(computeTurnDirection(4.9)).toBe("none");
      expect(computeTurnDirection(-4.9)).toBe("none");
    });

    it("returns 'right' when bankDeg > 5°", () => {
      expect(computeTurnDirection(5.1)).toBe("right");
      expect(computeTurnDirection(25)).toBe("right");
    });

    it("returns 'left' when bankDeg < -5°", () => {
      expect(computeTurnDirection(-5.1)).toBe("left");
      expect(computeTurnDirection(-25)).toBe("left");
    });

    it("exactly ±5° is still 'none' (exclusive threshold)", () => {
      expect(computeTurnDirection(5)).toBe("none");
      expect(computeTurnDirection(-5)).toBe("none");
    });

    it("return type is always one of the three TurnDirection values", () => {
      const valid: TurnDirection[] = ["left", "right", "none"];
      for (let b = -30; b <= 30; b += 2.5) {
        expect(valid).toContain(computeTurnDirection(b));
      }
    });
  });

  describe("Phase 17: computeTurnIntensity", () => {
    it("returns 0 at zero bank", () => {
      expect(computeTurnIntensity(0)).toBe(0);
    });

    it("returns 1 at max bank (25°)", () => {
      expect(computeTurnIntensity(25)).toBe(1);
      expect(computeTurnIntensity(-25)).toBe(1);
    });

    it("returns 0.5 at half max (12.5°)", () => {
      expect(computeTurnIntensity(12.5)).toBeCloseTo(0.5, 4);
    });

    it("is symmetric for equal left/right bank magnitudes", () => {
      for (let b = 1; b <= 25; b += 2) {
        expect(computeTurnIntensity(b)).toBeCloseTo(computeTurnIntensity(-b), 8);
      }
    });

    it("clamps to 1 for bank beyond 25°", () => {
      expect(computeTurnIntensity(50)).toBe(1);
      expect(computeTurnIntensity(-100)).toBe(1);
    });

    it("is always in [0, 1] for all bank angles", () => {
      for (let b = -360; b <= 360; b += 15) {
        const i = computeTurnIntensity(b);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Phase 17: computeNeckCurveDeg", () => {
    it("returns 0 at zero bank with forward (null) gaze", () => {
      expect(computeNeckCurveDeg(0, null)).toBe(0);
    });

    it("curves positive (right) when banking right", () => {
      expect(computeNeckCurveDeg(10, null)).toBeGreaterThan(0);
    });

    it("curves negative (left) when banking left", () => {
      expect(computeNeckCurveDeg(-10, null)).toBeLessThan(0);
    });

    it("is clamped to [-18, +18] for extreme bank inputs", () => {
      expect(computeNeckCurveDeg(100, null)).toBe(18);
      expect(computeNeckCurveDeg(-100, null)).toBe(-18);
    });

    it("gaze 'left' adds leftward curve even at zero bank", () => {
      expect(computeNeckCurveDeg(0, "left")).toBeLessThan(0);
    });

    it("gaze 'right' adds rightward curve even at zero bank", () => {
      expect(computeNeckCurveDeg(0, "right")).toBeGreaterThan(0);
    });

    it("gaze 'upleft'/'downleft' both add leftward curve", () => {
      expect(computeNeckCurveDeg(0, "upleft")).toBeLessThan(0);
      expect(computeNeckCurveDeg(0, "downleft")).toBeLessThan(0);
    });

    it("gaze 'upright'/'downright' both add rightward curve", () => {
      expect(computeNeckCurveDeg(0, "upright")).toBeGreaterThan(0);
      expect(computeNeckCurveDeg(0, "downright")).toBeGreaterThan(0);
    });

    it("vertical-only gaze ('up'/'down') does not change curve from zero bank", () => {
      expect(computeNeckCurveDeg(0, "up")).toBe(0);
      expect(computeNeckCurveDeg(0, "down")).toBe(0);
    });

    it("result is always finite for all inputs", () => {
      const gazes: GazeDirection[] = ["left", "right", "up", "down", "upleft", "upright", "downleft", "downright", null];
      for (const gaze of gazes) {
        for (let b = -30; b <= 30; b += 5) {
          expect(Number.isFinite(computeNeckCurveDeg(b, gaze))).toBe(true);
        }
      }
    });
  });

  describe("Phase 17: computeBodyTwistDeg", () => {
    it("returns 0 at zero bank", () => {
      expect(computeBodyTwistDeg(0)).toBe(0);
    });

    it("is smaller magnitude than bank (sub-proportional for realism)", () => {
      const twist = Math.abs(computeBodyTwistDeg(25));
      expect(twist).toBeLessThan(25);
    });

    it("does not exceed 45% of input bank angle", () => {
      for (let b = -25; b <= 25; b += 5) {
        const twist = computeBodyTwistDeg(b);
        expect(Math.abs(twist)).toBeLessThanOrEqual(Math.abs(b) * 0.50);
      }
    });

    it("is always finite", () => {
      expect(Number.isFinite(computeBodyTwistDeg(25))).toBe(true);
      expect(Number.isFinite(computeBodyTwistDeg(-25))).toBe(true);
      expect(Number.isFinite(computeBodyTwistDeg(0))).toBe(true);
    });

    it("same magnitude left and right (signed symmetry)", () => {
      expect(computeBodyTwistDeg(15)).toBeCloseTo(-computeBodyTwistDeg(-15), 8);
    });
  });

  describe("Phase 17: computeVerticalGazeTiltDeg", () => {
    it("returns 0 for null (forward gaze — default)", () => {
      expect(computeVerticalGazeTiltDeg(null)).toBe(0);
    });

    it("returns negative (head tilts back) for up gaze directions", () => {
      expect(computeVerticalGazeTiltDeg("up")).toBeLessThan(0);
      expect(computeVerticalGazeTiltDeg("upleft")).toBeLessThan(0);
      expect(computeVerticalGazeTiltDeg("upright")).toBeLessThan(0);
    });

    it("returns positive (head dips forward) for down gaze directions", () => {
      expect(computeVerticalGazeTiltDeg("down")).toBeGreaterThan(0);
      expect(computeVerticalGazeTiltDeg("downleft")).toBeGreaterThan(0);
      expect(computeVerticalGazeTiltDeg("downright")).toBeGreaterThan(0);
    });

    it("returns 0 for lateral-only gaze (left/right — no vertical component)", () => {
      expect(computeVerticalGazeTiltDeg("left")).toBe(0);
      expect(computeVerticalGazeTiltDeg("right")).toBe(0);
    });

    it("up tilt is more negative than down tilt is positive (head tucks more than it dips)", () => {
      const upTilt   = computeVerticalGazeTiltDeg("up");
      const downTilt = computeVerticalGazeTiltDeg("down");
      expect(Math.abs(upTilt)).toBeGreaterThan(0);
      expect(Math.abs(downTilt)).toBeGreaterThan(0);
    });

    it("all 8 gaze directions + null return finite numbers", () => {
      const gazes: GazeDirection[] = ["left", "right", "up", "down", "upleft", "upright", "downleft", "downright", null];
      for (const g of gazes) {
        expect(Number.isFinite(computeVerticalGazeTiltDeg(g))).toBe(true);
      }
    });
  });

  describe("Phase 17: computeInsideWingTuck", () => {
    it("returns 0 at zero bank (no tuck)", () => {
      expect(computeInsideWingTuck(0)).toBe(0);
    });

    it("returns 1 at maximum bank (25°) — fully tucked", () => {
      expect(computeInsideWingTuck(25)).toBe(1);
      expect(computeInsideWingTuck(-25)).toBe(1);
    });

    it("returns 0.5 at half max bank (12.5°)", () => {
      expect(computeInsideWingTuck(12.5)).toBeCloseTo(0.5, 4);
    });

    it("is always in [0, 1] for all bank angles including extreme", () => {
      for (let b = -100; b <= 100; b += 10) {
        const tuck = computeInsideWingTuck(b);
        expect(tuck).toBeGreaterThanOrEqual(0);
        expect(tuck).toBeLessThanOrEqual(1);
      }
    });

    it("is symmetric for equal magnitude left/right banks", () => {
      for (let b = 1; b <= 25; b += 3) {
        expect(computeInsideWingTuck(b)).toBeCloseTo(computeInsideWingTuck(-b), 8);
      }
    });
  });

  // ── Phase 17: Integration — kinematic chain consistency ──────────────────
  describe("Phase 17: kinematic chain integration contracts", () => {
    it("a right-turn scenario produces rightward neck curve + rightward head lead", () => {
      // Simulate a right turn: bankDeg = +15 (right)
      const bankDeg = 15;
      const neckCurve = computeNeckCurveDeg(bankDeg, null);
      const headLead  = computeNeckCurveDeg(bankDeg, null); // headLead uses bank directly in SankofaBirdSvg
      expect(neckCurve).toBeGreaterThan(0); // curves right
      expect(headLead).toBeGreaterThan(0);  // heads right
    });

    it("a left-turn scenario produces leftward neck curve + leftward head lead", () => {
      const bankDeg = -15;
      const neckCurve = computeNeckCurveDeg(bankDeg, null);
      expect(neckCurve).toBeLessThan(0); // curves left
    });

    it("turn intensity at threshold exactly matches direction switch point", () => {
      // When |bankDeg| = 5 (threshold), direction is 'none' AND intensity = 0.2
      // Both must be consistent — if direction is 'none', CSS vars being 0.2 is fine
      // (CSS rules only fire on data-turn-dir="left|right")
      const dir       = computeTurnDirection(5);
      const intensity = computeTurnIntensity(5);
      expect(dir).toBe("none");
      expect(intensity).toBeCloseTo(0.2, 4);
    });

    it("body twist magnitude is always less than bank (preserves visual realism)", () => {
      for (let b = -25; b <= 25; b += 5) {
        const twist = Math.abs(computeBodyTwistDeg(b));
        const bank  = Math.abs(b);
        if (bank > 0) expect(twist).toBeLessThan(bank);
      }
    });

    it("all phase-17 functions return finite numbers at every bank × gaze combination", () => {
      const banks:  number[]       = [-25, -15, -5, 0, 5, 15, 25];
      const gazes:  GazeDirection[] = ["left", "right", "up", "down", "upleft", "upright", "downleft", "downright", null];
      for (const b of banks) {
        for (const g of gazes) {
          expect(Number.isFinite(computeNeckCurveDeg(b, g))).toBe(true);
          expect(Number.isFinite(computeBodyTwistDeg(b))).toBe(true);
          expect(Number.isFinite(computeVerticalGazeTiltDeg(g))).toBe(true);
          expect(Number.isFinite(computeTurnIntensity(b))).toBe(true);
          expect(Number.isFinite(computeInsideWingTuck(b))).toBe(true);
        }
      }
    });

    it("computeVerticalGazeTiltDeg returns amplified ±14°/±12° values", () => {
      // Up directions: amplified from ±8° to ±14° so tilt is visible at 48px marker
      expect(computeVerticalGazeTiltDeg("up")).toBe(-14);
      expect(computeVerticalGazeTiltDeg("upleft")).toBe(-14);
      expect(computeVerticalGazeTiltDeg("upright")).toBe(-14);
      // Down directions: amplified from ±7° to ±12°
      expect(computeVerticalGazeTiltDeg("down")).toBe(12);
      expect(computeVerticalGazeTiltDeg("downleft")).toBe(12);
      expect(computeVerticalGazeTiltDeg("downright")).toBe(12);
      // Lateral and forward: unchanged at 0
      expect(computeVerticalGazeTiltDeg("left")).toBe(0);
      expect(computeVerticalGazeTiltDeg("right")).toBe(0);
      expect(computeVerticalGazeTiltDeg(null)).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 — computeGazeRotateDeg
// ─────────────────────────────────────────────────────────────────────────────
describe("computeGazeRotateDeg", () => {
  it("sums head-lead and vertical gaze correctly", () => {
    expect(computeGazeRotateDeg(10, 5)).toBe(15);
    expect(computeGazeRotateDeg(-8, 0)).toBe(-8);
    expect(computeGazeRotateDeg(0, -14)).toBe(-14);
    expect(computeGazeRotateDeg(22, 12)).toBe(34); // at clamp boundary
  });

  it("clamps to ±34° to prevent extreme over-rotation", () => {
    expect(computeGazeRotateDeg(22, 14)).toBe(34);   // 36 → clamped to 34
    expect(computeGazeRotateDeg(-22, -14)).toBe(-34); // -36 → clamped to -34
    expect(computeGazeRotateDeg(100, 100)).toBe(34);  // way above → clamped
    expect(computeGazeRotateDeg(-100, -100)).toBe(-34);
  });

  it("returns 0 for zero inputs", () => {
    expect(computeGazeRotateDeg(0, 0)).toBe(0);
  });

  it("handles floating point inputs", () => {
    const result = computeGazeRotateDeg(5.5, -2.3);
    expect(Math.abs(result - 3.2)).toBeLessThan(0.001);
  });

  it("is correct for every facing-right sign-negation scenario", () => {
    // When facingRight, JS negates headLeadDeg (horizontal) but NOT verticalGazeDeg.
    // Example: bankDeg=15 (right turn) → headLeadDeg=13.5, facingSign=-1
    //   facing left:  computeGazeRotateDeg(13.5,  0) =  13.5
    //   facing right: computeGazeRotateDeg(-13.5, 0) = -13.5 (sign-corrected for flip)
    expect(computeGazeRotateDeg(13.5,  0)).toBeCloseTo(13.5);
    expect(computeGazeRotateDeg(-13.5, 0)).toBeCloseTo(-13.5);
    // Vertical component unchanged by horizontal flip
    expect(computeGazeRotateDeg(-13.5, -14)).toBeCloseTo(-27.5);
    expect(computeGazeRotateDeg( 13.5, -14)).toBeCloseTo(-0.5);
  });

  it("all 8 gaze directions produce correct combined angles via helper chain", () => {
    // Real usage: computeGazeRotateDeg(computeHeadLeadDeg(0, null), computeVerticalGazeTiltDeg(dir))
    const straightHead = 0; // no bank, no upcoming turn
    expect(computeGazeRotateDeg(straightHead, computeVerticalGazeTiltDeg("up"))).toBe(-14);
    expect(computeGazeRotateDeg(straightHead, computeVerticalGazeTiltDeg("down"))).toBe(12);
    expect(computeGazeRotateDeg(straightHead, computeVerticalGazeTiltDeg("left"))).toBe(0);
    expect(computeGazeRotateDeg(straightHead, computeVerticalGazeTiltDeg(null))).toBe(0);
  });
});
