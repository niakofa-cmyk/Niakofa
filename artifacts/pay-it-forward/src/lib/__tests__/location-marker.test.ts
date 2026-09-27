import test from "node:test";
import assert from "node:assert/strict";
import {
  isLocationMarkerStyle,
  resolveLocationMarkerStyle,
} from "../location-marker.js";

test("location marker defaults to the blue puck", () => {
  assert.equal(resolveLocationMarkerStyle(undefined), "puck");
  assert.equal(resolveLocationMarkerStyle("unknown"), "puck");
  assert.equal(resolveLocationMarkerStyle("spirit"), "spirit");
});

test("reduced motion and battery saver force the puck", () => {
  assert.equal(resolveLocationMarkerStyle("spirit", { animationSuppressed: true }), "puck");
  assert.equal(resolveLocationMarkerStyle("spirit", { batterySaver: true }), "puck");
});

test("only supported marker styles are accepted", () => {
  assert.equal(isLocationMarkerStyle("puck"), true);
  assert.equal(isLocationMarkerStyle("spirit"), true);
  assert.equal(isLocationMarkerStyle("bird"), false);
  assert.equal(isLocationMarkerStyle(null), false);
});