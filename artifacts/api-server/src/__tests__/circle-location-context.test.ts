import { describe, expect, it } from "@jest/globals";
import { pickLocalSpiral } from "../lib/circleLocationContext";

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
});