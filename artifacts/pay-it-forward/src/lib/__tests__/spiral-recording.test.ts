import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { chooseSpiralRecordingMimeType, spiralRecordingMimeTypes } from "../spiralRecording";

const transport = readFileSync(new URL("../livekitCircleTransport.ts", import.meta.url), "utf8");

test("spiral recording keeps camera video out of the audio mix and records it separately", () => {
  assert.deepEqual(spiralRecordingMimeTypes(false)[0], "audio/webm;codecs=opus");
  assert.match(spiralRecordingMimeTypes(true)[0], /^video\//);
  assert.equal(chooseSpiralRecordingMimeType(true, (type) => type === "video/webm"), "video/webm");
  assert.equal(chooseSpiralRecordingMimeType(false, () => false), undefined);
  assert.match(transport, /audioTracksOnly\(stream\)/);
  assert.match(transport, /addStreamToMix\(this\.currentLocalStream\(\), "local"\)/);
  assert.doesNotMatch(transport, /addStreamToMix\(this\.emitLocalStream\(\), "local"\)/);
  assert.match(transport, /chooseSpiralRecordingMimeType\(hasVideo\)/);
  assert.match(transport, /await audioContext\.resume\(\)/);
  assert.match(transport, /cameraTrack\.clone\(\)/);
  assert.doesNotMatch(transport, /createMediaStreamSource\(stream\)/);
});
