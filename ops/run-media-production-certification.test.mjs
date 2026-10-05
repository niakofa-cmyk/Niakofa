import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(root, "ops/run-media-production-certification.sh");

function runRunner(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [runner], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: os.tmpdir(),
        TMPDIR: os.tmpdir(),
        BASE_URL: "https://niakofa.com",
        EXPECTED_COMMIT: "a".repeat(40),
        MEDIA_SMOKE_CONTEXT_KIND: "community",
        MEDIA_SMOKE_CONTEXT_ID: "1",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

const confirmedMediaGates = {
  ALLOW_MEDIA_PRODUCTION_E2E: "1",
  CONFIRM_DISPOSABLE_ACCOUNT: "1",
  CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE: "1",
  MEDIA_PLATFORM_V21_BROWSER_SMOKE: "1",
  USER_B_STATE: path.join(os.tmpdir(), "state-file-is-not-read-by-these-tests.json"),
};

test("requires production gates before attempting to load state", async () => {
  const result = await runRunner();

  assert.equal(result.status, 2);
  assert.match(result.stderr, /set ALLOW_MEDIA_PRODUCTION_E2E=1 explicitly/);
  assert.doesNotMatch(result.stderr, /Railway certification state|fetch failed/);
});

test("requires bucket privacy and same-bucket confirmation before state download", async () => {
  const result = await runRunner(confirmedMediaGates);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /confirm the existing Railway state bucket has no public-read policy or CDN route/);
  assert.doesNotMatch(result.stderr, /Railway certification state|fetch failed/);
});

test("rejects unapproved state object keys before bucket access", async () => {
  const result = await runRunner({
    ...confirmedMediaGates,
    CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE: "1",
    CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE: "1",
    CERTIFICATION_STATE_KEY: "../other-user/state.json",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /CERTIFICATION_STATE_KEY must be an approved fixed User A state key/);
  assert.doesNotMatch(result.stderr, /Railway certification state|fetch failed/);
});
