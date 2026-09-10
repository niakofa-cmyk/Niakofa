import assert from "node:assert/strict";
import test from "node:test";
import { getUsableMapLocation, mapLocationUnavailableMessage } from "../spiralMapLocation";

const now = Date.parse("2026-09-09T23:00:00.000Z");

const valid = {
  lat: 32.7555,
  lng: -97.3308,
  accuracy: 25,
  capturedAt: now - 30_000,
  source: "gps" as const,
};

test("fresh Map Locator GPS fix is usable for Spiral discovery", () => {
  assert.deepEqual(getUsableMapLocation(valid, now, "discovery"), {
    latitude: 32.7555,
    longitude: -97.3308,
    accuracy_meters: 25,
    captured_at: new Date(valid.capturedAt).toISOString(),
  });
});

test("discovery accepts a 10-minute-old Map Locator fix", () => {
  const older = { ...valid, capturedAt: now - 10 * 60_000 };
  assert.ok(getUsableMapLocation(older, now, "discovery"));
});

test("host mode rejects a 10-minute-old Map Locator fix", () => {
  const older = { ...valid, capturedAt: now - 10 * 60_000 };
  assert.equal(getUsableMapLocation(older, now, "host"), null);
});

test("discovery allows accuracy up to 250m; host stays at 150m", () => {
  const mid = { ...valid, accuracy: 200 };
  assert.ok(getUsableMapLocation(mid, now, "discovery"));
  assert.equal(getUsableMapLocation(mid, now, "host"), null);
});

test("ip or missing Map Locator source is never usable", () => {
  assert.equal(getUsableMapLocation({ ...valid, source: "ip" }, now, "discovery"), null);
  assert.equal(getUsableMapLocation(null, now, "discovery"), null);
});

test("mapLocationUnavailableMessage points users to Map, not a second Pinpoint", () => {
  assert.match(mapLocationUnavailableMessage(), /Map/);
  assert.doesNotMatch(mapLocationUnavailableMessage(), /Pinpoint/i);
});
