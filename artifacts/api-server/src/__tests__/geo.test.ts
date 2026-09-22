import { distanceMiles, distanceMeters } from "../lib/geo";

describe("distanceMiles", () => {
  it("returns 0 for identical coordinates", () => {
    expect(distanceMiles(40.7128, -74.006, 40.7128, -74.006)).toBeCloseTo(0, 5);
  });

  it("computes a known distance (NYC to LA) within reasonable tolerance", () => {
    // Actual great-circle distance is ~2451 miles
    const d = distanceMiles(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it("is symmetric (A to B equals B to A)", () => {
    const ab = distanceMiles(40.7128, -74.006, 34.0522, -118.2437);
    const ba = distanceMiles(34.0522, -118.2437, 40.7128, -74.006);
    expect(ab).toBeCloseTo(ba, 10);
  });

  it("computes a small known distance accurately (~1 mile apart)", () => {
    // Two points roughly 1 mile apart in NYC
    const d = distanceMiles(40.7128, -74.006, 40.7274, -74.006);
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.1);
  });
});

describe("distanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(distanceMeters(40.7128, -74.006, 40.7128, -74.006)).toBeCloseTo(0, 5);
  });

  it("is roughly 1609.34x distanceMiles for the same two points", () => {
    const miles = distanceMiles(40.7128, -74.006, 34.0522, -118.2437);
    const meters = distanceMeters(40.7128, -74.006, 34.0522, -118.2437);
    expect(meters / miles).toBeCloseTo(1609.34, 0);
  });

  it("is symmetric (A to B equals B to A)", () => {
    const ab = distanceMeters(40.7128, -74.006, 34.0522, -118.2437);
    const ba = distanceMeters(34.0522, -118.2437, 40.7128, -74.006);
    expect(ab).toBeCloseTo(ba, 10);
  });
});
