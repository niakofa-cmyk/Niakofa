import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildExchangeAcStates,
  EXCHANGE_ACCEPTANCE_ORIGIN,
} from "./build-exchange-ac-states.mjs";

const expectedCommit = "a".repeat(40);
const tokenA = "7.1700000000000.0.signature-a";
const tokenC = "8.1700000000000.0.signature-c";

async function privateDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "niakofa-exchange-ac-"));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function testEnv(outputDir, overrides = {}) {
  return {
    CONFIRM_EXCHANGE_DISPOSABLE_ACCOUNTS: "1",
    EXPECTED_COMMIT: expectedCommit,
    EXCHANGE_STATE_OUTPUT_DIR: outputDir,
    EXCHANGE_ACCOUNT_A_EMAIL: "approved-a@example.test",
    EXCHANGE_ACCOUNT_A_PASSWORD: "a-fixture-password-never-log",
    EXCHANGE_ACCOUNT_C_EMAIL: "approved-c@example.test",
    EXCHANGE_ACCOUNT_C_PASSWORD: "c-fixture-password-never-log",
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

function mockFetch({
  communityA = 10,
  communityC = 20,
  approvalA = "approved",
  approvalC = "approved",
  sensitiveUserField = false,
  largeProfileField = false,
  servedCommit = expectedCommit,
  loginStatus = 200,
} = {}) {
  const users = new Map([
    ["approved-a@example.test", {
      user: { id: 7, approval_status: approvalA, is_suspended: false, community_id: communityA,
        ...(largeProfileField ? { unrelated_profile_payload: "x".repeat(140_000) } : {}),
        ...(sensitiveUserField ? { password_hash: "must-not-be-written" } : {}) },
      token: tokenA,
    }],
    ["approved-c@example.test", {
      user: { id: 8, approval_status: approvalC, is_suspended: false, community_id: communityC,
        ...(largeProfileField ? { unrelated_profile_payload: "x".repeat(140_000) } : {}) },
      token: tokenC,
    }],
  ]);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.href, method: options.method ?? "GET" });
    assert.equal(parsed.origin, EXCHANGE_ACCEPTANCE_ORIGIN);
    if (parsed.pathname === "/api/version") {
      return jsonResponse({ commit: servedCommit });
    }
    if (parsed.pathname === "/api/users/login") {
      if (loginStatus !== 200) return jsonResponse({}, loginStatus);
      const { email } = JSON.parse(options.body);
      const record = users.get(email);
      return record
        ? jsonResponse({ token: record.token, user: record.user })
        : jsonResponse({}, 401);
    }
    const userId = Number(parsed.pathname.match(/^\/api\/users\/(\d+)$/)?.[1]);
    const record = [...users.values()].find((item) => item.user.id === userId);
    return record ? jsonResponse(record.user) : jsonResponse({}, 404);
  };
  return { fetchImpl, calls };
}

test("creates separate approved A/C states at the canonical origin with private permissions", async (t) => {
  const outputDir = await privateDirectory(t);
  const { fetchImpl, calls } = mockFetch({ largeProfileField: true });

  const result = await buildExchangeAcStates({
    env: testEnv(outputDir),
    fetchImpl,
  });

  assert.deepEqual(result.files, ["exchange-account-a.json", "exchange-account-c.json"]);
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
    "/api/version",
    "/api/users/login",
    "/api/users/7",
    "/api/users/login",
    "/api/users/8",
  ]);
  for (const [filename, expectedToken, expectedUser, expectedCommunity] of [
    ["exchange-account-a.json", tokenA, 7, 10],
    ["exchange-account-c.json", tokenC, 8, 20],
  ]) {
    const statePath = path.join(outputDir, filename);
    assert.equal((await stat(statePath)).mode & 0o777, 0o600);
    assert.ok((await stat(statePath)).size < 16 * 1024, "only the minimal identity should be stored");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(state.origins[0].origin, EXCHANGE_ACCEPTANCE_ORIGIN);
    assert.equal(
      state.origins[0].localStorage.find((entry) => entry.name === "niakofa_token").value,
      expectedToken,
    );
    assert.deepEqual(
      JSON.parse(state.origins[0].localStorage.find((entry) => entry.name === "niakofa_user").value),
      {
        id: expectedUser,
        approval_status: "approved",
        is_suspended: false,
        community_id: expectedCommunity,
      },
    );
  }
});

test("refuses without explicit disposable-account confirmation and does not contact production", async (t) => {
  const outputDir = await privateDirectory(t);
  let fetchCount = 0;

  await assert.rejects(
    buildExchangeAcStates({
      env: testEnv(outputDir, { CONFIRM_EXCHANGE_DISPOSABLE_ACCOUNTS: "" }),
      fetchImpl: async () => { fetchCount += 1; throw new Error("must not run"); },
    }),
    /CONFIRM_EXCHANGE_DISPOSABLE_ACCOUNTS/,
  );

  assert.equal(fetchCount, 0);
  assert.deepEqual(await readdir(outputDir), []);
});

test("refuses unapproved accounts and removes any partial output", async (t) => {
  const outputDir = await privateDirectory(t);
  const { fetchImpl } = mockFetch({ approvalC: "pending" });

  await assert.rejects(
    buildExchangeAcStates({ env: testEnv(outputDir), fetchImpl }),
    /account C is not approved/,
  );

  assert.deepEqual(await readdir(outputDir), []);
});

test("refuses same-community A/C identities without creating state files", async (t) => {
  const outputDir = await privateDirectory(t);
  const { fetchImpl } = mockFetch({ communityC: 10 });

  await assert.rejects(
    buildExchangeAcStates({ env: testEnv(outputDir), fetchImpl }),
    /different communities/,
  );

  assert.deepEqual(await readdir(outputDir), []);
});

test("rejects sensitive fields from account responses without exposing them", async (t) => {
  const outputDir = await privateDirectory(t);
  const { fetchImpl } = mockFetch({ sensitiveUserField: true });

  await assert.rejects(
    buildExchangeAcStates({ env: testEnv(outputDir), fetchImpl }),
    /sensitive field/,
  );

  assert.deepEqual(await readdir(outputDir), []);
});

test("refuses a served-commit mismatch before authentication", async (t) => {
  const outputDir = await privateDirectory(t);
  const { fetchImpl, calls } = mockFetch({ servedCommit: "b".repeat(40) });

  await assert.rejects(
    buildExchangeAcStates({ env: testEnv(outputDir), fetchImpl }),
    /does not match EXPECTED_COMMIT/,
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(await readdir(outputDir), []);
});

test("removes created states if local validation fails", async (t) => {
  const outputDir = await privateDirectory(t);
  const { fetchImpl } = mockFetch();
  let validationCount = 0;

  await assert.rejects(
    buildExchangeAcStates({
      env: testEnv(outputDir),
      fetchImpl,
      validateState() {
        validationCount += 1;
        if (validationCount === 2) throw new Error("private validator detail");
      },
    }),
    /partial files were removed/,
  );

  assert.equal(validationCount, 2);
  assert.deepEqual(await readdir(outputDir), []);
});

test("refuses output directories inside the repository and non-private directories", async (t) => {
  const outputDir = await privateDirectory(t);
  const repoPath = path.resolve(import.meta.dirname, "..");

  await assert.rejects(
    buildExchangeAcStates({ env: testEnv(repoPath), fetchImpl: async () => { throw new Error("must not run"); } }),
    /outside the repository/,
  );

  await chmod(outputDir, 0o755);
  await assert.rejects(
    buildExchangeAcStates({ env: testEnv(outputDir), fetchImpl: async () => { throw new Error("must not run"); } }),
    /mode 0700/,
  );
});

test("does not overwrite a pre-existing state file", async (t) => {
  const outputDir = await privateDirectory(t);
  const existingPath = path.join(outputDir, "exchange-account-a.json");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(existingPath, "existing-state", { mode: 0o600 }));
  let fetchCount = 0;

  await assert.rejects(
    buildExchangeAcStates({
      env: testEnv(outputDir),
      fetchImpl: async () => { fetchCount += 1; throw new Error("must not run"); },
    }),
    /already exists/,
  );

  assert.equal(fetchCount, 0);
  assert.equal(await readFile(existingPath, "utf8"), "existing-state");
});
