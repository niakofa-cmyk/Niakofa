import test from "node:test";
import assert from "node:assert/strict";
import { CircleRtcTelemetry } from "../circleRtcTelemetry";

test("RTC telemetry exports the safe media milestones", () => {
  const telemetry = new CircleRtcTelemetry();

  telemetry.markTokenReceived();
  telemetry.markCaptureStarted("audio");
  telemetry.markCaptureStarted("video");
  telemetry.markRendering("audio");
  telemetry.markRendering("video");

  const snapshot = telemetry.snapshot;
  assert.equal(snapshot.phase, "rendering");
  assert.deepEqual(
    snapshot.events.map((event) => event.type),
    [
      "livekit-token-received",
      "audio-capture-started",
      "video-capture-started",
      "audio-rendering",
      "video-rendering",
    ],
  );
  assert.deepEqual(
    JSON.parse(telemetry.exportJson()),
    JSON.parse(JSON.stringify(snapshot)),
  );
});

test("RTC telemetry keeps only the newest bounded events", () => {
  const telemetry = new CircleRtcTelemetry(2);

  telemetry.record("connecting", "first");
  telemetry.record("connected", "second");
  telemetry.record("failed", "third");

  assert.deepEqual(
    telemetry.snapshot.events.map((event) => event.type),
    ["second", "third"],
  );
});