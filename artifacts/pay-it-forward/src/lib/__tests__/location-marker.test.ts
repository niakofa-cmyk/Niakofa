import test from "node:test";
import assert from "node:assert/strict";
import {
  getAccuracyRingDiameterPx,
  getLocationMarkerState,
  isLocationMarkerStyle,
  resolveLocationMarkerStyle,
} from "../location-marker.js";

test("accuracy ring uses map scale when coordinates and zoom are available", () => {
  const close = getAccuracyRingDiameterPx({
    accuracyMeters: 200,
    size: 34,
    latitude: 32.75,
    mapZoom: 15,
  });
  const far = getAccuracyRingDiameterPx({
    accuracyMeters: 200,
    size: 34,
    latitude: 32.75,
    mapZoom: 12,
  });
  assert.ok(close > far);
  assert.equal(getAccuracyRingDiameterPx({
    accuracyMeters: null,
    size: 34,
    latitude: 32.75,
    mapZoom: 15,
  }), 0);
});

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

test("location state distinguishes live GPS, stale GPS, and approximate fallback", () => {
  const now = 1_000_000;
  assert.deepEqual(
    getLocationMarkerState({ source: "gps", accuracy: 12, capturedAt: now - 1_000 }, now),
    { source: "gps", signal: "live", accuracyMeters: 12, capturedAt: now - 1_000 },
  );
  assert.deepEqual(
    getLocationMarkerState({ source: "gps", accuracy: 80, capturedAt: now - 90_001 }, now),
    { source: "gps", signal: "stale", accuracyMeters: 80, capturedAt: now - 90_001 },
  );
  assert.deepEqual(
    getLocationMarkerState({ source: "ip", capturedAt: now }, now),
    { source: "ip", signal: "approximate", accuracyMeters: null, capturedAt: now },
  );
  assert.deepEqual(
    getLocationMarkerState({ source: "gps", privacyProtected: true, capturedAt: now }, now),
    { source: "privacy", signal: "privacy", accuracyMeters: null, capturedAt: now },
  );
});

test("invalid GPS accuracy fails closed instead of drawing a false precision ring", () => {
  assert.equal(
    getLocationMarkerState({ source: "gps", accuracy: Number.NaN }).accuracyMeters,
    null,
  );
});