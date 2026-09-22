/**
 * geo-utils.test.ts
 *
 * Unit tests for every public function in geo-utils.ts.
 *
 * Run with:
 *   pnpm --filter @workspace/pay-it-forward run test
 *
 * Covers:
 *   1. haversineMeters   — known pairs, symmetry, same-point, antipode, null-island
 *   2. haversineDistanceMiles — unit conversion wrapper
 *   3. isNearbyUser      — boundary conditions around NEARBY_USER_METERS (200 m)
 *   4. Edge cases        — poles, dateline-crossing, zero distance
 */

import { describe, it } from "node:test";
import { expect } from "expect";

import {
  haversineMeters,
  haversineDistanceMiles,
  isNearbyUser,
  NEARBY_USER_METERS,
} from "../geo-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Allow ±0.5 % relative error for haversine (geodesy approximation). */
function expectWithinHalf(actual: number, expected: number) {
  const tol = expected * 0.005;
  expect(actual).toBeGreaterThanOrEqual(expected - tol);
  expect(actual).toBeLessThanOrEqual(expected + tol);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. haversineMeters — known pairs
// ─────────────────────────────────────────────────────────────────────────────
describe("haversineMeters", () => {
  it("same point → 0 m", () => {
    expect(haversineMeters(32.7767, -96.7970, 32.7767, -96.7970)).toBe(0);
  });

  it("Fort Worth TX → Dallas TX ≈ 48 km", () => {
    // Approx 47–50 km depending on the exact city-center coords chosen.
    const d = haversineMeters(32.7555, -97.3308, 32.7767, -96.7970);
    expect(d).toBeGreaterThan(44_000);
    expect(d).toBeLessThan(52_000);
  });

  it("New York → London ≈ 5 570 km", () => {
    const d = haversineMeters(40.7128, -74.0060, 51.5074, -0.1278);
    expectWithinHalf(d, 5_570_000);
  });

  it("is symmetric — A→B equals B→A", () => {
    const a = haversineMeters(0, 0, 10, 10);
    const b = haversineMeters(10, 10, 0, 0);
    expect(a).toBeCloseTo(b, 6);
  });

  it("north pole → south pole ≈ 20 015 km (half circumference)", () => {
    const d = haversineMeters(90, 0, -90, 0);
    // half of 40 030 km
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThan(20_050_000);
  });

  it("handles null-island (0, 0) without NaN", () => {
    const d = haversineMeters(0, 0, 0, 1);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(100_000); // ~111 km per degree at equator
  });

  it("handles dateline crossing (lng 179 → -179)", () => {
    // ~222 km along equator
    const d = haversineMeters(0, 179, 0, -179);
    expect(d).toBeGreaterThan(200_000);
    expect(d).toBeLessThan(250_000);
  });

  it("1 degree of latitude at equator ≈ 111 km", () => {
    const d = haversineMeters(0, 0, 1, 0);
    expectWithinHalf(d, 111_195); // exact value for WGS-84 sphere
  });

  it("returns metres, not miles (sanity check: 1 deg lat >> 1609 m)", () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(100_000); // 111 km, not 111 miles
  });

  it("always returns a non-negative finite number", () => {
    const pairs: [number, number, number, number][] = [
      [90, 0, -90, 0],
      [-33.87, 151.21, 48.86, 2.35],
      [0, -180, 0, 180],
      [1.3521, 103.8198, 13.7563, 100.5018],
    ];
    for (const [lat1, lng1, lat2, lng2] of pairs) {
      const d = haversineMeters(lat1, lng1, lat2, lng2);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. haversineDistanceMiles
// ─────────────────────────────────────────────────────────────────────────────
describe("haversineDistanceMiles", () => {
  it("same point → 0 miles", () => {
    expect(haversineDistanceMiles(32.7767, -96.7970, 32.7767, -96.7970)).toBe(0);
  });

  it("1 degree of latitude at equator ≈ 69.1 miles", () => {
    const d = haversineDistanceMiles(0, 0, 1, 0);
    expect(d).toBeGreaterThan(68);
    expect(d).toBeLessThan(70);
  });

  it("is consistent with haversineMeters / 1609.344", () => {
    const lat1 = 32.7555, lng1 = -97.3308, lat2 = 32.7767, lng2 = -96.7970;
    const miles = haversineDistanceMiles(lat1, lng1, lat2, lng2);
    const fromMeters = haversineMeters(lat1, lng1, lat2, lng2) / 1609.344;
    expect(miles).toBeCloseTo(fromMeters, 8);
  });

  it("is symmetric", () => {
    const a = haversineDistanceMiles(10, 20, 30, 40);
    const b = haversineDistanceMiles(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. isNearbyUser — boundary conditions around 200 m
// ─────────────────────────────────────────────────────────────────────────────
describe("isNearbyUser", () => {
  it("NEARBY_USER_METERS constant is 200", () => {
    expect(NEARBY_USER_METERS).toBe(200);
  });

  it("same point → true (distance = 0 m < 200 m)", () => {
    expect(isNearbyUser(32.7767, -96.7970, 32.7767, -96.7970)).toBe(true);
  });

  it("100 m apart → true (well inside threshold)", () => {
    // 0.001° latitude ≈ 111 m at equator; use 0.0009° ≈ 100 m
    expect(isNearbyUser(0, 0, 0.0009, 0)).toBe(true);
  });

  it("exactly at boundary (~200 m) → false (exclusive <, not ≤)", () => {
    // 0.0018° latitude ≈ 200.1 m at equator
    const d = haversineMeters(0, 0, 0.0018, 0);
    // This should be ≥ 200 m, so isNearbyUser must return false
    if (d >= 200) {
      expect(isNearbyUser(0, 0, 0.0018, 0)).toBe(false);
    } else {
      // Floating-point may put us just inside; the threshold is strict <
      expect(isNearbyUser(0, 0, 0.0018, 0)).toBe(true);
    }
  });

  it("199 m apart → true", () => {
    // 0.00179° ≈ 199 m
    expect(isNearbyUser(0, 0, 0.00179, 0)).toBe(true);
  });

  it("201 m apart → false", () => {
    // 0.00181° ≈ 201 m
    expect(isNearbyUser(0, 0, 0.00181, 0)).toBe(false);
  });

  it("500 m apart → false (well outside threshold)", () => {
    // 0.0045° ≈ 500 m
    expect(isNearbyUser(0, 0, 0.0045, 0)).toBe(false);
  });

  it("works in longitude direction too (scaled by cos(lat))", () => {
    // At lat 45°, 1° lng ≈ 78.8 km; 0.001° lng ≈ 78.8 m — inside 200 m
    expect(isNearbyUser(45, 0, 45, 0.001)).toBe(true);
    // 0.003° lng at lat 45° ≈ 236 m — outside 200 m
    expect(isNearbyUser(45, 0, 45, 0.003)).toBe(false);
  });

  it("is symmetric — A near B iff B near A", () => {
    expect(isNearbyUser(10, 20, 10.001, 20)).toBe(isNearbyUser(10.001, 20, 10, 20));
    expect(isNearbyUser(0, 0, 0.005, 0)).toBe(isNearbyUser(0.005, 0, 0, 0));
  });

  it("far apart (1 km) → false", () => {
    // 0.009° ≈ 1 km
    expect(isNearbyUser(32.7767, -96.7970, 32.7858, -96.7970)).toBe(false);
  });

  it("real-world: two users at FW convention center & Sundance Sq (~1.3 km apart) → false", () => {
    // Fort Worth Convention Center: 32.7497, -97.3289
    // Sundance Square: 32.7537, -97.3308
    const d = haversineMeters(32.7497, -97.3289, 32.7537, -97.3308);
    expect(d).toBeGreaterThan(200);
    expect(isNearbyUser(32.7497, -97.3289, 32.7537, -97.3308)).toBe(false);
  });

  it("real-world: two users in same parking lot (~50 m apart) → true", () => {
    // Offset ~0.0005° lat ≈ 55 m
    expect(isNearbyUser(32.7497, -97.3289, 32.7502, -97.3289)).toBe(true);
  });
});
