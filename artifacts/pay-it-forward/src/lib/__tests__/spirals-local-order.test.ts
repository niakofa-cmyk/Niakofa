import assert from "node:assert/strict";
import test from "node:test";
import { filterActiveNeighborhoodSpirals, orderSpiralsForLocation, promoteLocalSpiral } from "../spirals";

// Spirals discovery, ordering, and hosting are location-independent: no GPS,
// Map Locator, or Host Signal checkpoint. promoteLocalSpiral and
// orderSpiralsForLocation are retained only as compatibility shims for
// existing callers and must NOT reorder based on a GPS-derived id.

test("promoteLocalSpiral is a no-op compatibility shim regardless of the local id", () => {
  const circles = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(promoteLocalSpiral(circles, 2), circles);
  assert.deepEqual(promoteLocalSpiral(circles, null), circles);
  assert.deepEqual(promoteLocalSpiral(circles, 99), circles);
});

test("promoteLocalSpiral returns a new array instance, not the same reference", () => {
  const circles = [{ id: 1 }, { id: 2 }];
  const result = promoteLocalSpiral(circles, 1);
  assert.deepEqual(result, circles);
  assert.notEqual(result, circles);
});

test("promoteLocalSpiral passes through undefined unchanged", () => {
  assert.equal(promoteLocalSpiral(undefined, 1), undefined);
});

test("orderSpiralsForLocation preserves server-provided order regardless of the local id", () => {
  const spirals = [
    { id: 10, neighborhood_id: null },
    { id: 11, neighborhood_id: 7 },
    { id: 12, neighborhood_id: 8 },
    { id: 13, neighborhood_id: null },
  ];
  assert.deepEqual(orderSpiralsForLocation(spirals, 12), spirals);
  assert.deepEqual(orderSpiralsForLocation(spirals, null), spirals);
});

test("orderSpiralsForLocation returns a new array instance", () => {
  const spirals = [{ id: 1, neighborhood_id: null }, { id: 2, neighborhood_id: 4 }];
  const result = orderSpiralsForLocation(spirals, null);
  assert.deepEqual(result, spirals);
  assert.notEqual(result, spirals);
});

test("discovery keeps curated neighborhoods and the city-wide Spiral, ignoring geometry status", () => {
  // filterActiveNeighborhoodSpirals is curation-based (source_kind), not
  // GPS/geometry-based — a neighborhood Spiral with no geometry at all is
  // still eligible as long as it's curated.
  const spirals = [
    { id: 1, neighborhood_id: null, source_kind: null },
    { id: 2, neighborhood_id: 4, source_kind: "curated" },
    { id: 3, neighborhood_id: 5, source_kind: "niakofa_curated" },
    { id: 4, neighborhood_id: 6, source_kind: "generated_hint" },
  ];
  assert.deepEqual(filterActiveNeighborhoodSpirals(spirals), [spirals[0], spirals[1], spirals[2]]);
});

test("discovery caps neighborhood Spirals at 9 and city-wide at 1", () => {
  const citywide = [
    { id: 100, neighborhood_id: null, source_kind: null },
    { id: 101, neighborhood_id: null, source_kind: null },
  ];
  const neighborhoods = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    neighborhood_id: i + 1,
    source_kind: "curated" as const,
  }));
  const result = filterActiveNeighborhoodSpirals([...citywide, ...neighborhoods]);
  assert.equal(result.filter((s) => s.neighborhood_id == null).length, 1);
  assert.equal(result.filter((s) => s.neighborhood_id != null).length, 9);
});
