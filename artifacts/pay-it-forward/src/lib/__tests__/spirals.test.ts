import assert from "node:assert/strict";
import test from "node:test";
import {
  CIRCLE_ROUTE_ALIASES,
  SPIRALS_PATHS,
  isSpiralRoute,
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