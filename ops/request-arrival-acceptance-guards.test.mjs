import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

function run(overrides = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of [
      "BASE_URL",
      "NIAKOFA_API_ORIGIN",
      "EXPECTED_COMMIT",
      "USER_A_STATE",
      "USER_B_STATE",
      "USER_A_STATE_JSON",
      "USER_B_STATE_JSON",
      "ALLOW_MUTATING_E2E",
      "CONFIRM_DISPOSABLE_ACCOUNT",
      "ALLOW_REQUEST_ARRIVAL_E2E",
    ]) {
      delete env[key];
    }

    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }

    const child = spawn("bash", ["ops/run-request-arrival-acceptance.sh"], {
      cwd: repositoryRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, output }));
  });
}

const valid = {
  BASE_URL: "https://example.test",
  NIAKOFA_API_ORIGIN: "https://example.test",
  EXPECTED_COMMIT: "0123456789abcdef0123456789abcdef01234567",
  USER_A_STATE: "/tmp/niakofa-arrival-requester.json",
  USER_B_STATE: "/tmp/niakofa-arrival-helper.json",
  ALLOW_MUTATING_E2E: "1",
  CONFIRM_DISPOSABLE_ACCOUNT: "1",
  ALLOW_REQUEST_ARRIVAL_E2E: "1",
};

test("requires the dedicated arrival gate", async () => {
  const result = await run({ ...valid, ALLOW_REQUEST_ARRIVAL_E2E: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /ALLOW_REQUEST_ARRIVAL_E2E=1/);
});

test("requires disposable-account confirmation", async () => {
  const result = await run({ ...valid, CONFIRM_DISPOSABLE_ACCOUNT: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /CONFIRM_DISPOSABLE_ACCOUNT=1/);
});

test("requires a full deployed commit SHA", async () => {
  const result = await run({ ...valid, EXPECTED_COMMIT: "short-sha" });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /full 40-character Git SHA/);
});

test("requires a helper storage state", async () => {
  const result = await run({ ...valid, USER_B_STATE: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /USER_B_STATE.*required/);
});

test("requires mutating-acceptance permission", async () => {
  const result = await run({ ...valid, ALLOW_MUTATING_E2E: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /ALLOW_MUTATING_E2E=1/);
});

test("rejects overlapping file and JSON state inputs", async () => {
  const result = await run({ ...valid, USER_A_STATE_JSON: "{}" });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /use USER_A_STATE_JSON or USER_A_STATE, not both/);
});