import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImportRows,
  diagnoseImportCollection,
  geometryFromSocrata,
  NEIGHBORHOOD_IMPORT_SOURCES,
  resolveSourceKey,
  validateGeometry,
} from "./ingest-neighborhood-boundaries";

test("rejects open polygon rings and out-of-range coordinates", () => {
  assert.equal(
    validateGeometry({ type: "Polygon", coordinates: [[[[-97, 32], [-97, 33], [-96, 33], [-96, 32]]]] }),
    false,
  );
  assert.equal(
    validateGeometry({ type: "Polygon", coordinates: [[[-197, 32], [-197, 33], [-196, 33], [-197, 32]]] }),
    false,
  );
});

test("accepts closed WGS84 polygons and multipolygons", () => {
  assert.equal(
    validateGeometry({ type: "Polygon", coordinates: [[[-97, 32], [-97, 33], [-96, 33], [-97, 32]]] }),
    true,
  );
  assert.equal(
    validateGeometry({
      type: "MultiPolygon",
      coordinates: [[[[-97, 32], [-97, 33], [-96, 33], [-97, 32]]]],
    }),
    true,
  );
});

test("resolveSourceKey ignores pnpm -- separator", () => {
  assert.equal(
    resolveSourceKey(["node", "ingest-neighborhood-boundaries.ts", "--", "fort_worth"]),
    "fort_worth",
  );
  assert.equal(
    resolveSourceKey(["node", "ingest-neighborhood-boundaries.ts", "kansas_city_missouri"]),
    "kansas_city_missouri",
  );
  assert.equal(resolveSourceKey(["node", "ingest-neighborhood-boundaries.ts", "--"]), undefined);
});

test("ingestion keeps authoritative source metadata but never verifies geometry", async () => {
  const source = NEIGHBORHOOD_IMPORT_SOURCES.fort_worth;
  const rows = await buildImportRows(
    source,
    {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        id: 42,
        properties: { NAME: "Example Neighborhood" },
        geometry: { type: "Polygon", coordinates: [[[-97, 32], [-97, 33], [-96, 33], [-97, 32]]] },
      }],
    },
    "sha256:test",
    new Date("2026-09-08T00:00:00.000Z"),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_kind, "municipal_gis");
  assert.equal(rows[0].authority_level, "authoritative");
  assert.equal(rows[0].geometry_valid, true);
  assert.equal(rows[0].geometry_verified, false);
  assert.equal(rows[0].reviewed, false);
});

test("KCMO source registry points at Neighborhood Borders (vq6h-tqrf)", () => {
  const source = NEIGHBORHOOD_IMPORT_SOURCES.kansas_city_missouri;
  assert.match(source.url, /vq6h-tqrf\.geojson/);
  assert.match(source.dataset, /vq6h-tqrf/);
  assert.ok(source.nameFields.includes("nbhname"));
});

test("KCMO accepts native GeoJSON geometry and preserves GPS-ineligible flags", async () => {
  const source = NEIGHBORHOOD_IMPORT_SOURCES.kansas_city_missouri;
  const rows = await buildImportRows(
    source,
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "kc-1",
          properties: { nbhname: "Test Neighborhood", objectid: 1 },
          geometry: {
            type: "Polygon",
            coordinates: [[[-94.60, 39.05], [-94.60, 39.06], [-94.59, 39.06], [-94.60, 39.05]]],
          },
        },
        {
          type: "Feature",
          id: "kc-2",
          properties: { NBHNAME: "Test Multi Neighborhood", objectid: 2 },
          geometry: {
            type: "MultiPolygon",
            coordinates: [[[[-94.58, 39.04], [-94.58, 39.05], [-94.57, 39.05], [-94.58, 39.04]]]],
          },
        },
      ],
    },
    "sha256:kcmo-test",
    new Date("2026-09-08T00:00:00.000Z"),
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.source_feature_id), ["kc-1", "kc-2"]);
  assert.ok(rows.every((row) => row.geometry_valid && !row.geometry_verified && !row.reviewed));
});

test("KCMO adapter unwraps JSON-encoded and nested geometry without guessing", () => {
  const polygon = {
    type: "Polygon",
    coordinates: [[[-94.60, 39.05], [-94.60, 39.06], [-94.59, 39.06], [-94.60, 39.05]]],
  };
  assert.deepEqual(geometryFromSocrata(JSON.stringify(polygon)), polygon);
  assert.deepEqual(geometryFromSocrata({ the_geom: JSON.stringify(polygon) }), polygon);
  assert.deepEqual(geometryFromSocrata({ geometry: polygon }), polygon);
  assert.equal(geometryFromSocrata({ the_geom: "not-json" }), null);
  assert.equal(geometryFromSocrata({ type: "Point", coordinates: [-94.6, 39.05] }), null);
});

test("diagnostics report null-geometry Socrata map views without inventing polygons", () => {
  const source = NEIGHBORHOOD_IMPORT_SOURCES.kansas_city_missouri;
  const diagnostics = diagnoseImportCollection(source, {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: null, properties: {} },
      { type: "Feature", geometry: null, properties: {} },
    ],
  });
  assert.equal(diagnostics.feature_count, 2);
  assert.equal(diagnostics.null_geometry, 2);
  assert.equal(diagnostics.valid_named_polygons, 0);
  assert.equal(diagnostics.empty_properties, 2);
});

test("diagnostics count valid named multipolygons from Borders-shaped payload", () => {
  const source = NEIGHBORHOOD_IMPORT_SOURCES.kansas_city_missouri;
  const diagnostics = diagnoseImportCollection(source, {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[-94.57, 39.01], [-94.57, 39.02], [-94.56, 39.02], [-94.57, 39.01]]]],
      },
      properties: { nbhname: "Eastern 49-63", objectid: 68 },
    }],
  });
  assert.equal(diagnostics.valid_named_polygons, 1);
  assert.equal(diagnostics.with_geometry, 1);
  assert.equal(diagnostics.null_geometry, 0);
});
