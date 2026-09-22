import { describe, it } from "node:test";
import { expect } from "expect";
import {
  normalizeDeg,
  shortestDelta,
  stepToward,
  smoothHeading,
  weightedCircularMean,
  circularMean,
  computeBearingDeg,
  haversineDistanceMeters,
} from "../heading-math";

// Every heading bug in this app's history traced back to plain (non-circular)
// arithmetic breaking at the 359°/0° wrap-around. These tests exist so that
// class of bug can't silently come back in a future change to this file.

describe("normalizeDeg", () => {
  it("leaves in-range angles unchanged", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(359)).toBe(359);
    expect(normalizeDeg(180)).toBe(180);
  });

  it("wraps angles >= 360 back into [0, 360)", () => {
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(361)).toBe(1);
    expect(normalizeDeg(720)).toBe(0);
  });

  it("wraps negative angles into [0, 360)", () => {
    expect(normalizeDeg(-1)).toBe(359);
    expect(normalizeDeg(-360)).toBe(0);
    expect(normalizeDeg(-361)).toBe(359);
  });
});

describe("shortestDelta", () => {
  it("returns 0 for identical angles", () => {
    expect(shortestDelta(45, 45)).toBe(0);
  });

  it("handles the classic 359° -> 1° wrap as +2, not -358", () => {
    expect(shortestDelta(359, 1)).toBe(2);
  });

  it("handles the reverse: 1° -> 359° as -2, not +358", () => {
    expect(shortestDelta(1, 359)).toBe(-2);
  });

  it("returns +/-180 for exact opposites, never 0", () => {
    expect(Math.abs(shortestDelta(0, 180))).toBe(180);
    expect(Math.abs(shortestDelta(90, 270))).toBe(180);
  });

  it("never returns a magnitude greater than 180", () => {
    for (let a = 0; a < 360; a += 37) {
      for (let b = 0; b < 360; b += 53) {
        expect(Math.abs(shortestDelta(a, b))).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("stepToward", () => {
  it("steps across the 0°/360° boundary in the short direction", () => {
    // From 359 toward 1, a 5°-max step should land past the wrap at 1,
    // not walk backward through 180.
    expect(stepToward(359, 1, 5)).toBe(1);
  });

  it("clamps to maxStep when the target is farther than one step away", () => {
    const result = stepToward(0, 90, 10);
    expect(result).toBe(10);
  });

  it("does not overshoot when already at the target", () => {
    expect(stepToward(45, 45, 10)).toBe(45);
  });
});

describe("smoothHeading", () => {
  it("returns the normalized target when there is no previous value", () => {
    expect(smoothHeading(null, 400, 0.5)).toBe(40);
  });

  it("moves toward 1° from 359° forward through the wrap, not backward through 180°", () => {
    const result = smoothHeading(359, 1, 0.5);
    // Correct short path from 359 to 1 passes through 0. A buggy linear EMA
    // would instead drag the value down toward 180.
    expect(result === 0 || result === 1 || (result > 359.4 && result <= 360)).toBe(true);
  });
});

describe("weightedCircularMean", () => {
  it("returns the same angle when both inputs match", () => {
    expect(weightedCircularMean(90, 1, 90, 1)).toBeCloseTo(90, 5);
  });

  it("averages 359° and 1° to 0°, not 180°", () => {
    const result = weightedCircularMean(359, 1, 1, 1);
    // Accept 0 or 360 (both represent the same angle after normalization)
    expect(result === 0 || Math.abs(result - 360) < 1e-9).toBe(true);
  });

  it("weights fully toward one side when the other has zero weight", () => {
    expect(weightedCircularMean(45, 1, 200, 0)).toBeCloseTo(45, 5);
    expect(weightedCircularMean(45, 0, 200, 1)).toBeCloseTo(200, 5);
  });
});

describe("circularMean", () => {
  it("returns 0 for an empty list", () => {
    expect(circularMean([])).toBe(0);
  });

  it("averages angles straddling the wrap correctly", () => {
    // 350°, 355°, 5°, 10° cluster tightly around 0° — the correct circular
    // mean is 0°, not ~180° (which a naive arithmetic mean would produce).
    const result = circularMean([350, 355, 5, 10]);
    const distanceFromZero = Math.min(result, 360 - result);
    expect(distanceFromZero).toBeLessThan(1);
  });

  it("respects per-angle weights", () => {
    const result = circularMean([0, 90], [1, 0]);
    expect(result).toBeCloseTo(0, 5);
  });
});

// computeBearingDeg / haversineDistanceMeters power usePositionHeading — the
// Sankofa bird's third-tier heading fallback (see usePositionHeading.ts).
// This is what makes the bird turn to face its direction of travel even when
// neither the compass nor the GPS chipset's own course-over-ground field is
// available, which was the root cause of "the bird only ever faces one
// direction."
describe("computeBearingDeg", () => {
  it("returns ~0 (north) when moving due north", () => {
    expect(computeBearingDeg(32.7555, -97.3308, 32.7655, -97.3308)).toBeCloseTo(0, 0);
  });

  it("returns ~90 (east) when moving due east", () => {
    expect(computeBearingDeg(32.7555, -97.3308, 32.7555, -97.3200)).toBeCloseTo(90, 0);
  });

  it("returns ~180 (south) when moving due south", () => {
    expect(computeBearingDeg(32.7655, -97.3308, 32.7555, -97.3308)).toBeCloseTo(180, 0);
  });

  it("returns ~270 (west) when moving due west", () => {
    expect(computeBearingDeg(32.7555, -97.3200, 32.7555, -97.3308)).toBeCloseTo(270, 0);
  });

  it("always returns a value in [0, 360)", () => {
    const b = computeBearingDeg(0, 0, -1, -1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters(32.7555, -97.3308, 32.7555, -97.3308)).toBe(0);
  });

  it("returns a small positive value for GPS-jitter-scale movement (~1m)", () => {
    // ~0.00001° lat ≈ 1.1m — should be well under the 3m movement floor
    // usePositionHeading uses to reject noise.
    const d = haversineDistanceMeters(32.7555, -97.3308, 32.75551, -97.3308);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(3);
  });

  it("returns ~1010m for a real ~0.01° eastward move at this latitude", () => {
    const d = haversineDistanceMeters(32.7555, -97.3308, 32.7555, -97.3200);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1020);
  });
});
