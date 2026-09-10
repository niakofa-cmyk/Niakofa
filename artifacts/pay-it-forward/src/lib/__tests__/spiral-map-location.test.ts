import assert from "node:assert/strict";
import test from "node:test";
import { getUsableMapLocation, mapLocationUnavailableMessage } from "../spiralMapLocation";

const now = Date.parse("2026-09-09T23:00:00.000Z");

const valid = {
  lat: 32.7555,
  lng: -97.3308,
  accuracy: 35,
  capturedAt: now - 30_000,
  source: "gps" as const,
};

test("fresh Map Locator GPS fix is usable for Spiral discovery", () => {
  assert.deepEqual(getUsableMapLocation(valid, now, "discovery"), {
    latitude: 32.7555,
    longitude: -97.3308,
    accuracy_meters: 35,
    captured_at: "2026-09-09T22:59:30.000Z",
  });
});

test("stale Map Locator fix is rejected instead of invoking a second GPS source", () => {
  assert.equal(
    getUsableMapLocation({ ...valid, capturedAt: now - 6 * 60_000 }, now, "discovery"),
    null,
  );
});

test("missing Map Locator fix is rejected", () => {
  assert.equal(getUsableMapLocation(null, now, "discovery"), null);
});

test("IP-derived Map location is never used as a Spiral GPS fix", () => {
  assert.equal(getUsableMapLocation({ ...valid, source: "ip" }, now, "discovery"), null);
});

test("host mode applies the stricter two-minute freshness window", () => {
  assert.equal(
    getUsableMapLocation({ ...valid, capturedAt: now - 121_000 }, now, "host"),
    null,
  );
  assert.ok(getUsableMapLocation({ ...valid, capturedAt: now - 119_000 }, now, "host"));
});

test("invalid coordinates and accuracy fail closed", () => {
  assert.equal(getUsableMapLocation({ ...valid, lat: 91 }, now), null);
  assert.equal(getUsableMapLocation({ ...valid, accuracy: 151 }, now), null);
  assert.equal(getUsableMapLocation({ ...valid, accuracy: null }, now), null);
});

test("missing-location UX points users back to the working Map Locator", () => {
  assert.match(mapLocationUnavailableMessage(), /Location.*Map.*neighborhood Spiral/i);
});
