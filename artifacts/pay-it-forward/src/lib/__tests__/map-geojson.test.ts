import { describe, test } from "node:test";
import * as assert from "node:assert";
import { lineStringToFeatureCollection } from "../map-geojson";

describe("map route GeoJSON", () => {
  test("wraps the navigation API's raw LineString geometry in a FeatureCollection", () => {
    assert.deepEqual(
      lineStringToFeatureCollection({
        type: "LineString",
        coordinates: [[-97.33, 32.75], [-97.32, 32.76]],
      }),
      {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [[-97.33, 32.75], [-97.32, 32.76]],
          },
        }],
      },
    );
  });

  test("rejects malformed, non-finite, or underspecified route geometry", () => {
    assert.equal(lineStringToFeatureCollection(null), null);
    assert.equal(lineStringToFeatureCollection({ type: "Feature", geometry: {} }), null);
    assert.equal(lineStringToFeatureCollection({ type: "LineString", coordinates: [[1, 2]] }), null);
    assert.equal(lineStringToFeatureCollection({ type: "LineString", coordinates: [[1, 2], [3, NaN]] }), null);
    assert.equal(lineStringToFeatureCollection({ type: "LineString", coordinates: [[181, 2], [3, 4]] }), null);
    assert.equal(lineStringToFeatureCollection({ type: "LineString", coordinates: [[1, -91], [3, 4]] }), null);
  });
});