import assert from "node:assert/strict";
import test from "node:test";
import { STORY_MEDIA_LIMITS, validateStoryMedia } from "../storyMediaPipeline";

function makeFile(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

test("accepts supported image and video MIME types", () => {
  assert.equal(validateStoryMedia(makeFile("photo.png", "image/png", 10)).ok, true);
  assert.equal(validateStoryMedia(makeFile("clip.mp4", "video/mp4", 10)).ok, true);
});

test("rejects unsupported MIME types and oversized files", () => {
  assert.equal(validateStoryMedia(makeFile("archive.zip", "application/zip", 10)).ok, false);
  assert.equal(
    validateStoryMedia(makeFile("large.png", "image/png", STORY_MEDIA_LIMITS.maxBytes + 1)).ok,
    false,
  );
});

test("accepts any positive video duration through three minutes and rejects longer videos", () => {
  assert.equal(validateStoryMedia(makeFile("brief.mp4", "video/mp4", 10), {
    durationSeconds: 0.001,
  }).ok, true);
  assert.equal(validateStoryMedia(makeFile("limit.mp4", "video/mp4", 10), {
    durationSeconds: 180,
  }).ok, true);
  const result = validateStoryMedia(makeFile("long.mp4", "video/mp4", 10), {
    durationSeconds: STORY_MEDIA_LIMITS.videoMaxSeconds + 1,
  });
  assert.equal(result.ok, false);
  assert.equal(validateStoryMedia(makeFile("empty.mp4", "video/mp4", 10), {
    durationSeconds: 0,
  }).ok, false);
});

test("rejects media dimensions outside the Story limit", () => {
  const result = validateStoryMedia(makeFile("wide.png", "image/png", 10), {
    width: STORY_MEDIA_LIMITS.maxWidth + 1,
    height: 100,
  });
  assert.equal(result.ok, false);
});