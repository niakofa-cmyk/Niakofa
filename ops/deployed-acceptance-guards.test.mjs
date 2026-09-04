import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function runAcceptance(overrides = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of [
      "BASE_URL",
      "USER_A_STATE",
      "EXPECTED_COMMIT",
      "ALLOW_MUTATING_E2E",
      "CONFIRM_DISPOSABLE_ACCOUNT",
    ]) {
      delete env[key];
    }
    Object.assign(env, overrides);
    const child = spawn("bash", ["ops/run-deployed-acceptance.sh"], { env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (status) => resolve({ status, output }));
  });
}

const base = {
  BASE_URL: "https://example.test",
  USER_A_STATE: "/tmp/does-not-exist.json",
  EXPECTED_COMMIT: "6a889169",
  ALLOW_MUTATING_E2E: "1",
  CONFIRM_DISPOSABLE_ACCOUNT: "1",
};

test("requires exact deployed commit intent", async () => {
  const { EXPECTED_COMMIT: _removed, ...withoutCommit } = base;
  const result = await runAcceptance(withoutCommit);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /EXPECTED_COMMIT is required/);
});

test("requires explicit disposable-account confirmation", async () => {
  const { CONFIRM_DISPOSABLE_ACCOUNT: _removed, ...withoutConfirmation } = base;
  const result = await runAcceptance(withoutConfirmation);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /CONFIRM_DISPOSABLE_ACCOUNT=1/);
});

test("rejects invalid commit identifiers before reading auth state", async () => {
  const result = await runAcceptance({ ...base, EXPECTED_COMMIT: "not-a-commit" });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /7-40 character Git commit SHA/);
});

test("refuses a missing credential-bearing storage-state file", async () => {
  const result = await runAcceptance(base);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /not a readable file path/);
});