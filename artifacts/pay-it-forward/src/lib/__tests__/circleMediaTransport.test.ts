import test from "node:test";
import assert from "node:assert/strict";
import { selectMediaTransportKind } from "../circleMediaTransport";

test("every Circle uses LiveKit regardless of expected room size", () => {
  assert.equal(
    selectMediaTransportKind({ expectedSpeakers: 4, expectedListeners: 20 }),
    "livekit",
  );
  assert.equal(
    selectMediaTransportKind({ expectedSpeakers: 9, expectedListeners: 1 }),
    "livekit",
  );
  assert.equal(
    selectMediaTransportKind({ expectedSpeakers: 1, expectedListeners: 1 }),
    "livekit",
  );
});

test("preferSfu has no effect because LiveKit is always selected", () => {
  assert.equal(
    selectMediaTransportKind({ expectedSpeakers: 2, expectedListeners: 2, preferSfu: false }),
    "livekit",
  );
});