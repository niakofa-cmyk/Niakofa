import assert from "node:assert/strict";
import test from "node:test";
import {
  CIRCLE_ROUTE_ALIASES,
  SPIRALS_PATHS,
  filterActiveNeighborhoodSpirals,
  isSpiralRoute,
  orderSpiralsForLocation,
  promoteLocalSpiral,
} from "../spirals";

test("Spirals routes use the canonical public paths", () => {
  assert.equal(SPIRALS_PATHS.discovery, "/audio-spirals");
  assert.equal(SPIRALS_PATHS.room(42), "/audio-spiral/42");
});

test("legacy Circle paths remain recognized for existing links", () => {
  assert.equal(CIRCLE_ROUTE_ALIASES.discovery, "/audio-circles");
  assert.equal(CIRCLE_ROUTE_ALIASES.room, "/audio-circle/:id");
  assert.equal(isSpiralRoute("/audio-circles"), true);
  assert.equal(isSpiralRoute("/audio-circle/42"), true);
});

test("unrelated paths are not treated as Spirals routes", () => {
  assert.equal(isSpiralRoute("/community"), false);
});

test("curated discovery includes city-wide and excludes generated GIS hints", () => {
  const rows = [
    { id: 1, neighborhood_id: null, source_kind: null },
    { id: 2, neighborhood_id: 10, source_kind: "niakofa_curated" },
    { id: 3, neighborhood_id: 11, source_kind: "generated_hint" },
    { id: 4, neighborhood_id: 12, source_kind: "curated" },
  ];
  assert.deepEqual(filterActiveNeighborhoodSpirals(rows).map((row) => row.id), [1, 2, 4]);
});

test("legacy local-id promotion is now a stable identity operation", () => {
  const rows = [
    { id: 1, neighborhood_id: null },
    { id: 2, neighborhood_id: 10 },
    { id: 3, neighborhood_id: 11 },
  ];
  assert.deepEqual(orderSpiralsForLocation(rows, 3).map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(promoteLocalSpiral(rows, 3)?.map((row) => row.id), [1, 2, 3]);
});
