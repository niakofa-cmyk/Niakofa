import { describe, expect, it } from "@jest/globals";
import { pickLocalSpiral, pickVerifiedLocalSpiral } from "../lib/circleLocationContext";

const circles = [
  { id: 1, neighborhood_id: 11, neighborhood_name: "Southside" },
  { id: 2, neighborhood_id: 12, neighborhood_name: "Como" },
  { id: 3, neighborhood_id: null, neighborhood_name: null },
];

describe("automatic Spiral location context", () => {
  it("matches the verified Mapbox neighborhood to its Spiral", () => {
    expect(pickLocalSpiral(circles, "south side")).toEqual(circles[0]);
  });

  it("falls back to the city-wide Spiral when the neighborhood is unknown", () => {
    expect(pickLocalSpiral(circles, "Unlisted neighborhood")).toEqual(circles[2]);
  });

  it("does not let the city-wide fallback capture a known neighborhood", () => {
    const cityWideFirst = [circles[2], circles[0], circles[1]];
    expect(pickLocalSpiral(cityWideFirst, "South Side")).toEqual(circles[0]);
  });

  it("does not invent a location when no city-wide Spiral exists", () => {
    expect(pickLocalSpiral(circles.slice(0, 2), null)).toBeNull();
  });

  it("selects a neighborhood only when the server GPS point is inside reviewed geometry", () => {
    const reviewed = [{
      id: 4,
      neighborhood_id: 14,
      neighborhood_name: "Downtown",
      center_lat: null,
      center_lng: null,
      radius_meters: null,
      polygon_geojson: {
        type: "Polygon",
        coordinates: [[
          [-97.34, 32.74],
          [-97.32, 32.74],
          [-97.32, 32.76],
          [-97.34, 32.76],
          [-97.34, 32.74],
        ]],
      },
      geometry_verified: true,
      geometry_effective_at: "2026-01-01T00:00:00.000Z",
    }];

    expect(pickVerifiedLocalSpiral(reviewed, 32.75, -97.33, "Downtown")).toMatchObject({
      circle: { id: 4 },
      neighborhoodGeofenceStatus: "inside",
    });
    expect(pickVerifiedLocalSpiral(reviewed, 32.8, -97.4, "Downtown")).toMatchObject({
      circle: null,
      neighborhoodGeofenceStatus: "outside",
    });
  });

  it("does not promote an unreviewed provider neighborhood hint", () => {
    expect(pickVerifiedLocalSpiral([{
      id: 5,
      neighborhood_id: 15,
      neighborhood_name: "Downtown",
      center_lat: 32.75,
      center_lng: -97.33,
      radius_meters: 500,
      geometry_verified: false,
    }], 32.75, -97.33, "Downtown")).toEqual({
      circle: null,
      neighborhoodGeofenceStatus: "no_geometry",
    });
  });
});