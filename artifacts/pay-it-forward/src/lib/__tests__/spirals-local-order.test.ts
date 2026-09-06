import assert from "node:assert/strict";
import test from "node:test";
import { promoteLocalSpiral } from "../spirals";

test("server-verified local Spiral is promoted without reordering the rest", () => {
  const circles = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(promoteLocalSpiral(circles, 2), [{ id: 2 }, { id: 1 }, { id: 3 }]);
});

test("Spiral order remains unchanged until the server verifies a local match", () => {
  const circles = [{ id: 1 }, { id: 2 }];
  assert.equal(promoteLocalSpiral(circles, null), circles);
  assert.equal(promoteLocalSpiral(circles, 99), circles);
});