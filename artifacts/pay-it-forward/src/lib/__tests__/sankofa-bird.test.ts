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
  type LandingPhase,
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
