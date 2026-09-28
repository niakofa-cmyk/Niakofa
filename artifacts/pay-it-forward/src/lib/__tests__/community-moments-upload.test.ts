import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_MOMENTS_MAX_BYTES,
  validateCommunityMomentFile,
} from "../community-moments-upload";

test("Community and Hub Moments accept supported secure-upload media", () => {
  for (const type of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
  ]) {
    assert.equal(validateCommunityMomentFile({ type, size: COMMUNITY_MOMENTS_MAX_BYTES }), null);
  }
});

test("Moments reject unsupported media, empty uploads, and files above the server limit", () => {
  assert.match(validateCommunityMomentFile({ type: "application/pdf", size: 1 }) ?? "", /Choose a JPEG/);
  assert.match(validateCommunityMomentFile({ type: "image/jpeg", size: 0 }) ?? "", /between 1 byte and 64 MiB/);
  assert.match(validateCommunityMomentFile({ type: "image/jpeg", size: COMMUNITY_MOMENTS_MAX_BYTES + 1 }) ?? "", /between 1 byte and 64 MiB/);
});

test("draft and media helpers remain separate from Exchange Spark upload contracts", async () => {
  const source = await import("../community-moments-upload");
  assert.equal(typeof source.uploadCommunityMomentMedia, "function");
  assert.equal(typeof source.saveCommunityMomentDraft, "function");
  assert.equal(typeof source.getCommunityMomentDraft, "function");
  assert.equal(typeof source.deleteCommunityMomentDraft, "function");
});