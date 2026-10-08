import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runAcceptance(overrides = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of [
      "BASE_URL",
      "NIAKOFA_API_ORIGIN",
      "USER_A_STATE",
      "USER_A_STATE_JSON",
      "USER_B_STATE",
      "USER_B_STATE_JSON",
      "EXPECTED_COMMIT",
      "ALLOW_MUTATING_E2E",
      "CONFIRM_DISPOSABLE_ACCOUNT",
      "ALLOW_COUNTY_TRAVEL_E2E",
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
  NIAKOFA_API_ORIGIN: "https://example.test",
  USER_A_STATE: "/tmp/does-not-exist.json",
  USER_B_STATE: "/tmp/does-not-exist-b.json",
  EXPECTED_COMMIT: "6a889169",
  ALLOW_MUTATING_E2E: "1",
  CONFIRM_DISPOSABLE_ACCOUNT: "1",
  ALLOW_COUNTY_TRAVEL_E2E: "1",
};

function stateJson(id) {
  return JSON.stringify({
    cookies: [],
    origins: [{
      origin: "https://example.test",
      localStorage: [
        { name: "niakofa_token", value: `${id}.1700000000000.0.signature` },
        { name: "niakofa_user", value: JSON.stringify({ id }) },
      ],
    }],
  });
}

async function createStateFile(directory, name, id) {
  const filePath = path.join(directory, name);
  await writeFile(filePath, stateJson(id), { mode: 0o600 });
  return filePath;
}

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
  assert.match(result.output, /USER_A_STATE validation failed: the file is missing/);
});

test("prefers valid state files over malformed inline JSON without making a request", async () => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "niakofa-deployed-state-test-"));
  try {
    const userAState = await createStateFile(stateDirectory, "user-a.json", 7);
    const userBState = await createStateFile(stateDirectory, "user-b.json", 8);
    const result = await runAcceptance({
      ...base,
      BASE_URL: "https://example.test/admin",
      USER_A_STATE: userAState,
      USER_B_STATE: userBState,
      USER_A_STATE_JSON: "not-json",
      USER_B_STATE_JSON: "not-json",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.output, /BASE_URL must be a credential-free http\(s\) origin/);
    assert.doesNotMatch(result.output, /materialize-storage-state/);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("uses inline JSON only when the corresponding state file path is absent", async () => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "niakofa-deployed-state-test-"));
  try {
    const userBState = await createStateFile(stateDirectory, "user-b.json", 8);
    const result = await runAcceptance({
      ...base,
      BASE_URL: "https://example.test/admin",
      USER_A_STATE: "",
      USER_B_STATE: userBState,
      USER_A_STATE_JSON: stateJson(7),
    });

    assert.notEqual(result.status, 0);
    assert.match(result.output, /BASE_URL must be a credential-free http\(s\) origin/);
    assert.doesNotMatch(result.output, /storage state input is not valid JSON/);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("county travel has a separate explicit mutation gate", async () => {
  const { ALLOW_COUNTY_TRAVEL_E2E: _removed, ...withoutCountyGate } = base;
  const result = await runAcceptance(withoutCountyGate);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /ALLOW_COUNTY_TRAVEL_E2E=1/);
});