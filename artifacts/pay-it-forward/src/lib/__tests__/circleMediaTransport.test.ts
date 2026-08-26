import test from "node:test";
import assert from "node:assert/strict";
import { selectMediaTransportKind } from "../circleMediaTransport";

test("small Circles keep the lightweight mesh transport by default", () => {
  assert.equal(
    selectMediaTransportKind({ expectedSpeakers: 4, expectedListeners: 20 }),
    "mesh",
  );
});

test("large or explicitly opted-in Circles use the LiveKit transport", () => {
  assert.equal(
    selectMediaTransportKind({ expectedSpeakers: 9, expectedListeners: 1 }),
    "livekit",
  );
  assert.equal(
    selectMediaTransportKind({ expectedSpeakers: 2, expectedListeners: 2, preferSfu: true }),
    "livekit",
  );
});