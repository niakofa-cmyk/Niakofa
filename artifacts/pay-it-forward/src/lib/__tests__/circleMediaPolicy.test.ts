import test from "node:test";
import assert from "node:assert/strict";
import { canPublishCircleMedia } from "../circleMediaPolicy";

test("open rooms allow every active participant to publish", () => {
  for (const role of ["host", "co_host", "speaker", "listener"] as const) {
    assert.equal(canPublishCircleMedia(role, "open"), true);
  }
});

test("moderated rooms retain stage approval for media publishing", () => {
  assert.equal(canPublishCircleMedia("listener", "moderated"), false);
  assert.equal(canPublishCircleMedia("speaker", "moderated"), true);
  assert.equal(canPublishCircleMedia("host", "moderated"), true);
});

test("missing participant role is never allowed to publish", () => {
  assert.equal(canPublishCircleMedia(undefined, "open"), false);
});