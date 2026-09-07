import { describe, expect, it } from "@jest/globals";
import {
  evaluateNeighborhoodGeofence,
  pointInRing,
  pointInPolygon,
} from "../lib/neighborhoodGeofence";
import { buildHostSignal } from "../lib/circleLocationPolicy";

describe("neighborhood geofence", () => {
  // Simple square around Downtown Fort Worth-ish (not real boundaries).
  const square: [number, number][] = [
    [-97.34, 32.74],
    [-97.32, 32.74],
    [-97.32, 32.76],
    [-97.34, 32.76],
    [-97.34, 32.74],
  ];

  it("pointInRing detects interior points", () => {
    expect(pointInRing(-97.33, 32.75, square)).toBe(true);
    expect(pointInRing(-97.40, 32.75, square)).toBe(false);
  });

  it("pointInPolygon accepts GeoJSON Polygon", () => {
    const geojson = { type: "Polygon", coordinates: [square] };
    expect(pointInPolygon(-97.33, 32.75, geojson)).toBe(true);
    expect(pointInPolygon(-97.40, 32.75, geojson)).toBe(false);
  });

  it("returns no_geometry when unverified", () => {
    const result = evaluateNeighborhoodGeofence(32.75, -97.33, {
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: false,
    });
    expect(result.status).toBe("no_geometry");
  });

  it("allows inside radius when verified", () => {
    const result = evaluateNeighborhoodGeofence(32.7501, -97.3301, {
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: true,
    });
    expect(result).toEqual({ status: "inside", method: "radius" });
  });

  it("denies outside radius when verified", () => {
    const result = evaluateNeighborhoodGeofence(32.8, -97.4, {
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: true,
    });
    expect(result).toEqual({ status: "outside", method: "radius" });
  });

  it("prefers polygon over radius", () => {
    const result = evaluateNeighborhoodGeofence(32.75, -97.33, {
      center_lat: 0,
      center_lng: 0,
      radius_meters: 1,
      polygon_geojson: { type: "Polygon", coordinates: [square] },
      geometry_verified: true,
    });
    expect(result).toEqual({ status: "inside", method: "polygon" });
  });

  it("invalid_geometry when verified but empty", () => {
    const result = evaluateNeighborhoodGeofence(32.75, -97.33, {
      geometry_verified: true,
    });
    expect(result.status).toBe("invalid_geometry");
  });
});

describe("buildHostSignal", () => {
  it("ready message includes neighborhood and optional boundary note", () => {
    const signal = buildHostSignal({
      canHost: true,
      spiralCityDisplay: "Fort Worth",
      spiralNeighborhood: "Downtown",
      neighborhoodHint: "Downtown",
      neighborhoodGeofenceStatus: "inside",
    });
    expect(signal.status).toBe("ready");
    expect(signal.message).toContain("Downtown");
    expect(signal.message).toContain("neighborhood boundary verified");
  });

  it("blocked wrong-city message preserves join affordance", () => {
    const signal = buildHostSignal({
      canHost: false,
      spiralCityDisplay: "Fort Worth",
      resolvedCityDisplay: "Dallas",
      code: "CIRCLE_START_WRONG_CITY",
    });
    expect(signal.status).toBe("blocked");
    expect(signal.message).toMatch(/Dallas/);
    expect(signal.message).toMatch(/still join/i);
  });

  it("blocked outside neighborhood message", () => {
    const signal = buildHostSignal({
      canHost: false,
      spiralCityDisplay: "Fort Worth",
      spiralNeighborhood: "East Fort Worth",
      code: "CIRCLE_START_OUTSIDE_NEIGHBORHOOD",
    });
    expect(signal.status).toBe("blocked");
    expect(signal.message).toMatch(/East Fort Worth/);
  });
});
