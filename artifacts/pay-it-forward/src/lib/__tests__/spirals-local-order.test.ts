import assert from "node:assert/strict";
import test from "node:test";
import { orderSpiralsForLocation, promoteLocalSpiral } from "../spirals";

test("server-verified local Spiral is promoted without reordering the rest", () => {
  const circles = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(promoteLocalSpiral(circles, 2), [{ id: 2 }, { id: 1 }, { id: 3 }]);
});

test("Spiral order remains unchanged until the server verifies a local match", () => {
  const circles = [{ id: 1 }, { id: 2 }];
  assert.equal(promoteLocalSpiral(circles, null), circles);
  assert.equal(promoteLocalSpiral(circles, 99), circles);
});

test("verified neighborhood Spiral is first and city-wide Spiral is last", () => {
  const spirals = [
    { id: 10, neighborhood_id: null },
    { id: 11, neighborhood_id: 7 },
    { id: 12, neighborhood_id: 8 },
    { id: 13, neighborhood_id: null },
  ];
  assert.deepEqual(orderSpiralsForLocation(spirals, 12), [
    { id: 12, neighborhood_id: 8 },
    { id: 11, neighborhood_id: 7 },
    { id: 10, neighborhood_id: null },
    { id: 13, neighborhood_id: null },
  ]);
});

test("city-wide Spiral moves last even when no local neighborhood is verified", () => {
  const spirals = [
    { id: 1, neighborhood_id: null },
    { id: 2, neighborhood_id: 4 },
    { id: 3, neighborhood_id: 5 },
  ];
  assert.deepEqual(orderSpiralsForLocation(spirals, null), [
    { id: 2, neighborhood_id: 4 },
    { id: 3, neighborhood_id: 5 },
    { id: 1, neighborhood_id: null },
  ]);
});
