import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = fs.readFileSync(path.join(root, "ops/run-family-story-bucket-playback.sh"), "utf8");
const spec = fs.readFileSync(path.join(root, "e2e/family-story-bucket-playback.spec.ts"), "utf8");

test("Family Story runner downloads only User A state and enforces explicit read-only gates", () => {
  for (const gate of [
    "ALLOW_FAMILY_STORY_READONLY_E2E",
    "CONFIRM_DISPOSABLE_ACCOUNT",
    "CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE",
    "CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE",
  ]) {
    assert.ok(runner.includes(gate), `missing ${gate}`);
  }
  assert.match(runner, /railway-bucket-object\.mjs" get/);
  assert.match(runner, /validate-user-a-state\.mjs/);
  assert.match(runner, /USER_A_STATE_JSON/);
  assert.match(runner, /USER_B_STATE_JSON/);
  assert.match(runner, /mktemp -d/);
  assert.match(runner, /chmod 700/);
  assert.match(runner, /trap cleanup EXIT/);
  assert.match(runner, /EXPECTED_COMMIT/);
  assert.match(runner, /https:\/\/niakofa\.com/);
  assert.match(runner, /FAMILY_STORY_ID/);
  assert.doesNotMatch(runner, /ALLOW_MUTATING_E2E|CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE/);
});

test("Family Story browser check uses GET-only APIs and proves same-origin streamed playback", () => {
  assert.match(spec, /\/api\/family\/mine/);
  assert.match(spec, /\/stories\?page=/);
  assert.match(spec, /audience !== "private"/);
  assert.match(spec, /Private Family Story video/);
  assert.match(spec, /page\.waitForResponse/);
  assert.match(spec, /responseUrl\.origin === base\.origin/);
  assert.match(spec, /content-type/);
  assert.match(spec, /currentTime/);
  assert.match(spec, /route\.abort\("blockedbyclient"\)/);
  assert.match(spec, /trace: "off"/);
  assert.match(spec, /screenshot: "off"/);
  assert.match(spec, /video: "off"/);
  assert.doesNotMatch(spec, /\.request\.(post|put|patch|delete)\s*\(/i);
});
