import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
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

test("prefers validated requester and helper files over inline JSON fallback", async () => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "niakofa-arrival-state-test-"));
  try {
    const userAState = await createStateFile(stateDirectory, "user-a.json", 7);
    const userBState = await createStateFile(stateDirectory, "user-b.json", 8);
    const result = await run({
      ...valid,
      BASE_URL: "https://example.test/admin",
      USER_A_STATE: userAState,
      USER_B_STATE: userBState,
      USER_A_STATE_JSON: "not-json",
      USER_B_STATE_JSON: "not-json",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.output, /BASE_URL must be a credential-free HTTP\(S\) origin/);
    assert.doesNotMatch(result.output, /materialize-storage-state/);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("uses valid JSON fallback only when the corresponding file path is absent", async () => {
  const result = await run({
    ...valid,
    BASE_URL: "https://example.test/admin",
    USER_A_STATE: "",
    USER_B_STATE: "",
    USER_A_STATE_JSON: stateJson(7),
    USER_B_STATE_JSON: stateJson(8),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /BASE_URL must be a credential-free HTTP\(S\) origin/);
  assert.doesNotMatch(result.output, /storage state input is not valid JSON/);
});

test("an explicitly configured invalid file path fails closed instead of switching identities", async () => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "niakofa-arrival-state-test-"));
  try {
    const userBState = await createStateFile(stateDirectory, "user-b.json", 8);
    const result = await run({
      ...valid,
      USER_A_STATE: path.join(stateDirectory, "missing-user-a.json"),
      USER_B_STATE: userBState,
      USER_A_STATE_JSON: stateJson(7),
    });

    assert.notEqual(result.status, 0);
    assert.match(result.output, /USER_A_STATE validation failed: the file is missing/);
    assert.doesNotMatch(result.output, /BASE_URL and NIAKOFA_API_ORIGIN/);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
});