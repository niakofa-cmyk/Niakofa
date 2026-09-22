import { describe, expect, it } from "@jest/globals";
import {
  evaluateNeighborhoodGeofence,
  getNeighborhoodGeometryStatus,
  isActiveNeighborhood,
  isHostSignalEligibleNeighborhood,
  pointInRing,
  pointInPolygon,
  validateNeighborhoodGeometry,
} from "../lib/neighborhoodGeofence";
import { buildHostSignal } from "../lib/circleLocationPolicy";

describe("neighborhood geofence", () => {
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

  it("rejects a polygon with malformed or out-of-range vertices instead of filtering them", () => {
    expect(
      pointInPolygon(-97.33, 32.75, {
        type: "Polygon",
        coordinates: [[
          [-97.34, 32.74],
          ["bad", 32.75],
          [-97.32, 32.76],
        ]],
      }),
    ).toBeNull();
    expect(
      pointInPolygon(-97.33, 32.75, {
        type: "Polygon",
        coordinates: [[
          [-97.34, 32.74],
          [181, 32.75],
          [-97.32, 32.76],
        ]],
      }),
    ).toBeNull();
  });

  it("respects polygon holes and supports MultiPolygon", () => {
    const hole: [number, number][] = [
      [-97.335, 32.745],
      [-97.325, 32.745],
      [-97.325, 32.755],
      [-97.335, 32.755],
      [-97.335, 32.745],
    ];
    expect(pointInPolygon(-97.33, 32.75, { type: "Polygon", coordinates: [square, hole] })).toBe(false);
    expect(
      pointInPolygon(-97.33, 32.75, {
        type: "MultiPolygon",
        coordinates: [
          [square],
          [[[-97.5, 32.7], [-97.49, 32.7], [-97.49, 32.71]]],
        ],
      }),
    ).toBe(true);
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

  it("fails closed for malformed or not-yet-effective verified geometry", () => {
    expect(
      evaluateNeighborhoodGeofence(32.75, -97.33, {
        geometry_verified: true,
        geometry_effective_at: "not-a-date",
      }),
    ).toMatchObject({ status: "invalid_geometry" });
    expect(
      evaluateNeighborhoodGeofence(32.75, -97.33, {
        geometry_verified: true,
        geometry_effective_at: "2099-01-01T00:00:00.000Z",
        polygon_geojson: { type: "Polygon", coordinates: [] },
      }),
    ).toMatchObject({ status: "no_geometry" });
    expect(
      evaluateNeighborhoodGeofence(32.75, -97.33, {
        geometry_verified: true,
        polygon_geojson: { type: "Polygon", coordinates: [] },
      }),
    ).toMatchObject({ status: "invalid_geometry" });
  });

  it("requires complete reviewed metadata and exposes a deterministic status", () => {
    expect(validateNeighborhoodGeometry({
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
    })).toBeNull();
    expect(validateNeighborhoodGeometry({
      center_lat: 32.75,
      center_lng: null,
      radius_meters: 500,
    })).toMatch(/valid latitude\/longitude/);
    expect(getNeighborhoodGeometryStatus({
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: false,
    })).toBe("pending_review");
    expect(getNeighborhoodGeometryStatus({
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: true,
      geometry_effective_at: "2099-01-01T00:00:00.000Z",
    }, new Date("2026-09-07T00:00:00.000Z"))).toBe("scheduled");
  });
});

describe("isHostSignalEligibleNeighborhood", () => {
  it("marks only reviewed, effective authoritative geometry as active discovery", () => {
    const base = {
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: true,
      verified: true,
      source_kind: "municipal_gis",
      authority_level: "authoritative",
    };
    expect(isActiveNeighborhood(base, new Date("2026-09-07T00:00:00.000Z"))).toBe(true);
    expect(isActiveNeighborhood({ ...base, verified: false }, new Date("2026-09-07T00:00:00.000Z"))).toBe(false);
    expect(isActiveNeighborhood({ ...base, source_kind: "generated_hint", authority_level: "generated" }, new Date("2026-09-07T00:00:00.000Z"))).toBe(false);
    expect(isActiveNeighborhood({
      ...base,
      geometry_effective_at: "2099-01-01T00:00:00.000Z",
    }, new Date("2026-09-07T00:00:00.000Z"))).toBe(false);
  });

  it("requires verified + geometry_verified and rejects generated sources", () => {
    expect(
      isHostSignalEligibleNeighborhood({
        verified: true,
        geometry_verified: true,
        source_kind: "municipal_gis",
        authority_level: "authoritative",
      }),
    ).toBe(true);

    expect(
      isHostSignalEligibleNeighborhood({
        verified: false,
        geometry_verified: true,
        source_kind: "municipal_gis",
        authority_level: "authoritative",
      }),
    ).toBe(false);

    expect(
      isHostSignalEligibleNeighborhood({
        verified: true,
        geometry_verified: false,
        source_kind: "municipal_gis",
        authority_level: "authoritative",
      }),
    ).toBe(false);

    expect(
      isHostSignalEligibleNeighborhood({
        verified: true,
        geometry_verified: true,
        source_kind: "generated_hint",
        authority_level: "generated",
      }),
    ).toBe(false);
  });

  it("treats geometry_verified without verified as no_geometry when authority fields present", () => {
    const result = evaluateNeighborhoodGeofence(32.75, -97.33, {
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: true,
      verified: false,
      source_kind: "municipal_gis",
      authority_level: "authoritative",
    });
    expect(result.status).toBe("no_geometry");
  });

  it("rejects generated authority even when both flags are true", () => {
    const result = evaluateNeighborhoodGeofence(32.75, -97.33, {
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: true,
      verified: true,
      source_kind: "generated_hint",
      authority_level: "generated",
    });
    expect(result.status).toBe("no_geometry");
  });
});

describe("buildHostSignal", () => {
  // Location-independent hosting: messages no longer require GPS boundary language.
  it("ready message includes neighborhood and city", () => {
    const signal = buildHostSignal({
      canHost: true,
      spiralCityDisplay: "Fort Worth",
      spiralNeighborhood: "Downtown",
      neighborhoodHint: "Downtown",
      neighborhoodGeofenceStatus: "inside",
    });
    expect(signal.status).toBe("ready");
    expect(signal.message).toContain("Downtown");
    expect(signal.message).toContain("Fort Worth");
  });

  it("blocked message uses provided reason when present", () => {
    const signal = buildHostSignal({
      canHost: false,
      spiralCityDisplay: "Fort Worth",
      resolvedCityDisplay: "Dallas",
      code: "CIRCLE_START_WRONG_CITY",
      reason: "Hosting unlocked in Fort Worth only. GPS shows Dallas. You can still join.",
    });
    expect(signal.status).toBe("blocked");
    expect(signal.message).toMatch(/Dallas/);
    expect(signal.message).toMatch(/still join/i);
  });

  it("blocked outside neighborhood message uses reason", () => {
    const signal = buildHostSignal({
      canHost: false,
      spiralCityDisplay: "Fort Worth",
      spiralNeighborhood: "East Fort Worth",
      code: "CIRCLE_START_OUTSIDE_NEIGHBORHOOD",
      reason: "You are in Fort Worth, but outside the verified boundary for the East Fort Worth Spiral.",
    });
    expect(signal.status).toBe("blocked");
    expect(signal.message).toMatch(/East Fort Worth/);
  });
});
