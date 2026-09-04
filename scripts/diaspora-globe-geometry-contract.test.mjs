import assert from "node:assert/strict";
import test from "node:test";
import { greatCirclePath } from "../artifacts/pay-it-forward/src/lib/diaspora/greatCircle.ts";

test("great-circle paths include interpolated globe points", () => {
  const path = greatCirclePath({ lat: 0, lng: 0 }, { lat: 0, lng: 90 }, 8);
  assert.equal(path.length, 9);
  assert.deepEqual(path[0], [0, 0]);
  assert.deepEqual(path[path.length - 1], [90, 0]);
  assert.ok(path.some((point) => Math.abs(point[0] - 45) < 1e-9));
});

test("great-circle steps are bounded", () => {
  assert.equal(greatCirclePath({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, 0).length, 3);
  assert.equal(greatCirclePath({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, 1000).length, 97);
});

test("identical points stay stable", () => {
  assert.deepEqual(greatCirclePath({ lat: 12, lng: 34 }, { lat: 12, lng: 34 }), [[34, 12], [34, 12]]);
});
