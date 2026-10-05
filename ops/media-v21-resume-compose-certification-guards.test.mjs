import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = fs.readFileSync(path.join(root, "ops/run-media-v21-resume-compose-certification.sh"), "utf8");
const spec = fs.readFileSync(path.join(root, "e2e/media-v21-resume-compose.spec.ts"), "utf8");
const operatorGuide = fs.readFileSync(path.join(root, "ops/media-v21-resume-compose-certification.md"), "utf8");

test("operator runner requires every production authorization gate", () => {
  for (const gate of [
    "ALLOW_MEDIA_PRODUCTION_E2E",
    "CONFIRM_DISPOSABLE_ACCOUNT",
    "CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE",
    "MEDIA_PLATFORM_V21_BROWSER_SMOKE",
  ]) {
    assert.match(runner, new RegExp(`\\b${gate}\\b`));
  }
  assert.match(runner, /EXPECTED_COMMIT.*40-character/);
  assert.match(runner, /USER_A_STATE/);
  assert.match(runner, /USER_B_STATE/);
  assert.ok(runner.includes("validate-user-a-state.mjs"));
  assert.match(runner, /0o600/);
  assert.match(runner, /chmod 700/);
  assert.match(runner, /trap cleanup EXIT/);
  assert.match(runner, /--list/);
  assert.match(runner, /unset MEDIA_SMOKE_CONTEXT_KIND MEDIA_SMOKE_CONTEXT_ID/);
  assert.match(runner, /USER_A_STATE_JSON/);
  assert.match(runner, /USER_B_STATE_JSON/);
});

test("acceptance is gated and preflights deployment before writes", () => {
  assert.ok(spec.includes("test.skip("));
  assert.match(spec, /ALLOW_MEDIA_PRODUCTION_E2E/);
  assert.match(spec, /CONFIRM_DISPOSABLE_ACCOUNT/);
  assert.match(spec, /CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE/);
  assert.match(spec, /MEDIA_PLATFORM_V21_BROWSER_SMOKE/);
  assert.ok(spec.includes("/api/healthz"));
  assert.ok(spec.includes("/api/readiness"));
  assert.ok(spec.includes("/api/version"));
  assert.match(spec, /media_platform_flag/);
  assert.match(spec, /cloud_configured/);
  assert.match(spec, /servedCommit.*expectedCommit/);
  assert.match(spec, /contextKind: "community_moment"/);
  assert.match(spec, /contextId: ownerId/);
  assert.match(spec, /CLEANUP INCOMPLETE/);
});

test("certification contract covers resume, accessibility, composition, privacy, and cleanup", () => {
  assert.match(spec, /upload-session/);
  assert.ok(spec.includes("session.offset"));
  assert.match(spec, /client_publish_id/);
  assert.match(spec, /media_accessibility/);
  assert.match(spec, /camera_clip_reel/);
  assert.ok(spec.includes("moment-composition/playback-grant"));
  assert.match(spec, /Range: "bytes=0-31"/);
  assert.match(spec, /USER_B must not receive a private playback grant/);
  assert.match(spec, /Anonymous playback without the private grant/);
  assert.ok(spec.includes("community/stories/${storyId}"));
  assert.match(operatorGuide, /normal realtime Story-created event/);
  assert.match(operatorGuide, /lost response/);
});

test("approved retention preserves the composed Story and source assets without issuing deletes", () => {
  assert.match(runner, /MEDIA_CERT_RETAIN_TEST_MEDIA/);
  assert.match(runner, /CONFIRM_RETAIN_PRODUCTION_MEDIA/);
  assert.match(spec, /MEDIA_CERT_RETAINED story_id=/);
  assert.match(spec, /MEDIA_CERT_PRESERVED_AFTER_FAILURE/);
  const retentionBranch = spec.split("if (retainProductionMedia) {")[1]?.split("} else {")[0];
  assert.ok(retentionBranch, "the retention branch must be separate from default cleanup");
  assert.doesNotMatch(retentionBranch, /\.delete\(/);
});