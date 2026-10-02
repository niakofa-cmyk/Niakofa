import assert from "node:assert/strict";
import test from "node:test";
import { recordingArchiveType } from "../src/lib/recordingArchive.ts";

test("spiral recordings keep audio and camera video types for storage", () => {
  assert.deepEqual(recordingArchiveType("video/webm;codecs=vp8,opus"), { mimeType: "video/webm", extension: "webm" });
  assert.deepEqual(recordingArchiveType("video/mp4"), { mimeType: "video/mp4", extension: "mp4" });
  assert.deepEqual(recordingArchiveType("audio/webm"), { mimeType: "audio/webm", extension: "webm" });
  assert.deepEqual(recordingArchiveType("audio/mp4"), { mimeType: "audio/mp4", extension: "m4a" });
  assert.deepEqual(recordingArchiveType(""), { mimeType: "audio/webm", extension: "webm" });
  assert.equal(recordingArchiveType("application/octet-stream"), null);
});
