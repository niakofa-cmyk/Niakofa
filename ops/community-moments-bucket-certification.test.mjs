import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = fs.readFileSync(path.join(root, "ops/run-community-moments-bucket-certification.sh"), "utf8");
const uploader = fs.readFileSync(path.join(root, "ops/upload-railway-user-a-state.sh"), "utf8");
const helper = fs.readFileSync(path.join(root, "ops/railway-bucket-object.mjs"), "utf8");
const spec = fs.readFileSync(path.join(root, "e2e/community-moments-readonly.spec.ts"), "utf8");
const guide = fs.readFileSync(path.join(root, "ops/README.md"), "utf8");

test("bucket-backed runner uses only the fixed private User A object and explicit production gates", () => {
  for (const gate of [
    "ALLOW_COMMUNITY_MOMENTS_READONLY_E2E",
    "CONFIRM_DISPOSABLE_ACCOUNT",
    "CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE",
  ]) {
    assert.ok(runner.includes(gate));
  }
  assert.match(runner, /niakofa-production-media/);
  assert.match(runner, /test-auth\/user-a\/niakofa-state\.json/);
  assert.match(runner, /STORAGE_CDN_URL/);
  assert.match(runner, /mktemp -d/);
  assert.match(runner, /chmod 700/);
  assert.match(runner, /trap cleanup EXIT/);
  assert.match(runner, /railway-bucket-object\.mjs" get/);
  assert.match(runner, /validate-user-a-state\.mjs/);
  assert.match(runner, /env -i/);
  assert.match(runner, /unset USER_A_STATE_JSON USER_B_STATE_JSON USER_B_STATE/);
});

test("local uploader accepts a state-file path and does not request public access", () => {
  assert.match(uploader, /<local-state-file>/);
  assert.match(uploader, /validate-user-a-state\.mjs/);
  assert.match(uploader, /railway-bucket-object\.mjs" put/);
  assert.match(uploader, /CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE/);
  assert.match(helper, /test-auth\/user-a\/niakofa-state\.json/);
  assert.match(helper, /const signedHeaders = "host;x-amz-content-sha256;x-amz-date"/);
  assert.doesNotMatch(helper, /x-amz-acl/);
});

test("Moments acceptance requires only User A and suppresses credential-bearing artifacts", () => {
  assert.match(spec, /ALLOW_COMMUNITY_MOMENTS_READONLY_E2E/);
  assert.match(spec, /test\.use\(\{\s*storageState: ownerState,/);
  assert.match(spec, /trace: "off"/);
  assert.match(spec, /screenshot: "off"/);
  assert.match(spec, /video: "off"/);
  assert.doesNotMatch(spec, /!helperState/);
  assert.match(guide, /run-community-moments-bucket-certification\.sh/);
  assert.match(guide, /upload-railway-user-a-state\.sh/);
});