#!/usr/bin/env node

// Creates private, validated Playwright states for the Exchange A/C acceptance
// roles. This script contacts production only when explicitly invoked.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { serializeStorageState } from "./user-state-serialization.mjs";

export const EXCHANGE_ACCEPTANCE_ORIGIN = "https://niakofa.com";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sensitiveKey = /password|passwd|secret|reset.?code/i;

function fail(message) {
  throw new Error(message);
}

function validatePrivateOutputDirectory(outputDir) {
  if (!outputDir || !path.isAbsolute(outputDir)) {
    fail("EXCHANGE_STATE_OUTPUT_DIR must be an absolute private directory outside the repository.");
  }

  const resolved = path.resolve(outputDir);
  let info;
  let real;
  try {
    info = fs.lstatSync(resolved);
    real = fs.realpathSync(resolved);
  } catch {
    fail("EXCHANGE_STATE_OUTPUT_DIR must already exist as a private directory.");
  }
  if (info.isSymbolicLink() || !info.isDirectory() || real !== resolved) {
    fail("EXCHANGE_STATE_OUTPUT_DIR must be a non-symlink directory.");
  }
  const relative = path.relative(repositoryRoot, real);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    fail("EXCHANGE_STATE_OUTPUT_DIR must be outside the repository.");
  }
  if ((info.mode & 0o077) !== 0 || (info.mode & 0o700) !== 0o700) {
    fail("EXCHANGE_STATE_OUTPUT_DIR must have mode 0700.");
  }

  return real;
}

function rejectSensitiveFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (sensitiveKey.test(key)) {
      fail("the account response contains a sensitive field; refusing to write storage state.");
    }
    rejectSensitiveFields(nested);
  }
}

function readAccountIdentity(user, label) {
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    fail(`account ${label} returned an invalid user record.`);
  }
  rejectSensitiveFields(user);

  const id = Number(user.id);
  const communityId = user.community_id === null ? null : Number(user.community_id);
  if (!Number.isSafeInteger(id) || id < 1 || user.approval_status !== "approved"
    || user.is_suspended !== false) {
    fail(`account ${label} is not approved and active.`);
  }
  if (!Object.hasOwn(user, "community_id") || communityId === null
    || !Number.isSafeInteger(communityId) || communityId < 1) {
    fail(`account ${label} does not have a valid assigned community.`);
  }
  return { id, communityId };
}

async function requestJson(fetchImpl, pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetchImpl(new URL(pathname, EXCHANGE_ACCEPTANCE_ORIGIN), {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    fail("a production authentication request could not be completed; response details were not logged.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response?.ok) {
    const status = Number(response?.status);
    fail(Number.isInteger(status) ? `production request was refused (HTTP ${status}).` : "production request was refused.");
  }
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      fail("production returned an invalid response.");
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("production returned")) throw error;
    fail("production returned invalid JSON.");
  }
}

async function authenticateAccount(fetchImpl, account) {
  const login = await requestJson(fetchImpl, "/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const token = typeof login.token === "string" ? login.token : "";
  const identity = readAccountIdentity(login.user, account.label);
  if (!token || token.split(".").length !== 4) {
    fail(`account ${account.label} did not return a valid authenticated session.`);
  }

  const verifiedUser = await requestJson(fetchImpl, `/api/users/${identity.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const verifiedIdentity = readAccountIdentity(verifiedUser, account.label);
  if (verifiedIdentity.id !== identity.id || verifiedIdentity.communityId !== identity.communityId) {
    fail(`account ${account.label} identity changed during verification.`);
  }

  return {
    identity,
    state: {
      cookies: [],
      origins: [{
        origin: EXCHANGE_ACCEPTANCE_ORIGIN,
        localStorage: [
          { name: "niakofa_token", value: token },
          // The Exchange acceptance runner needs only the verified identity.
          // Do not persist the full profile response, which can contain
          // unrelated or bulky personal data.
          {
            name: "niakofa_user",
            value: JSON.stringify({
              id: identity.id,
              approval_status: "approved",
              is_suspended: false,
              community_id: identity.communityId,
            }),
          },
        ],
      }],
    },
  };
}

function validateStateFile(statePath, label) {
  const check = spawnSync(process.execPath, [
    path.join(repositoryRoot, "ops/validate-user-a-state.mjs"),
    statePath,
    `USER_${label}_STATE`,
    EXCHANGE_ACCEPTANCE_ORIGIN,
  ], { cwd: repositoryRoot, stdio: "ignore" });
  if (check.error || check.status !== 0) {
    fail(`account ${label} state failed local storage-state validation.`);
  }
}

export async function buildExchangeAcStates({
  env,
  fetchImpl = fetch,
  validateState = validateStateFile,
}) {
  if (env.CONFIRM_EXCHANGE_DISPOSABLE_ACCOUNTS !== "1") {
    fail("set CONFIRM_EXCHANGE_DISPOSABLE_ACCOUNTS=1 only for approved disposable Exchange accounts A and C.");
  }
  const expectedCommit = env.EXPECTED_COMMIT?.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedCommit ?? "")) {
    fail("EXPECTED_COMMIT must be the full 40-character production commit.");
  }

  const outputDir = validatePrivateOutputDirectory(env.EXCHANGE_STATE_OUTPUT_DIR);
  const accounts = [
    {
      label: "A",
      email: env.EXCHANGE_ACCOUNT_A_EMAIL?.trim(),
      password: env.EXCHANGE_ACCOUNT_A_PASSWORD,
      filename: "exchange-account-a.json",
    },
    {
      label: "C",
      email: env.EXCHANGE_ACCOUNT_C_EMAIL?.trim(),
      password: env.EXCHANGE_ACCOUNT_C_PASSWORD,
      filename: "exchange-account-c.json",
    },
  ];
  if (accounts.some((account) => !account.email || !account.password)
    || accounts[0].email.toLowerCase() === accounts[1].email.toLowerCase()) {
    fail("distinct EXCHANGE_ACCOUNT_A_* and EXCHANGE_ACCOUNT_C_* credentials are required.");
  }

  const outputPaths = accounts.map((account) => path.join(outputDir, account.filename));
  for (const outputPath of outputPaths) {
    try {
      fs.lstatSync(outputPath);
      fail("a target state file already exists; choose a fresh private output directory.");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("a target state file")) throw error;
      if (error?.code !== "ENOENT") fail("could not safely inspect the target state files.");
    }
  }

  const version = await requestJson(fetchImpl, "/api/version", { method: "GET" });
  if (String(version.commit ?? "").toLowerCase() !== expectedCommit) {
    fail("the served production commit does not match EXPECTED_COMMIT.");
  }

  const authenticated = [];
  for (const account of accounts) {
    authenticated.push(await authenticateAccount(fetchImpl, account));
  }
  if (authenticated[0].identity.id === authenticated[1].identity.id) {
    fail("accounts A and C resolved to the same user.");
  }
  if (authenticated[0].identity.communityId === authenticated[1].identity.communityId) {
    fail("accounts A and C must belong to different communities.");
  }

  const serializedStates = authenticated.map(({ state }) => serializeStorageState(state));
  const writtenPaths = [];
  try {
    for (let index = 0; index < accounts.length; index += 1) {
      const outputPath = outputPaths[index];
      fs.writeFileSync(outputPath, serializedStates[index], {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      writtenPaths.push(outputPath);
      fs.chmodSync(outputPath, 0o600);
      validateState(outputPath, accounts[index].label);
    }
  } catch {
    for (const outputPath of writtenPaths) {
      try { fs.rmSync(outputPath, { force: true }); } catch {}
    }
    fail("storage-state creation or validation failed; partial files were removed.");
  }

  return { files: outputPaths.map((outputPath) => path.basename(outputPath)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildExchangeAcStates({ env: process.env });
    process.stdout.write("PASS: approved A/C storage states were created and validated in the private output directory.\n");
  } catch (error) {
    process.stderr.write(`Exchange A/C state generation failed: ${
      error instanceof Error ? error.message : "safe validation failure"
    }\n`);
    process.exitCode = 1;
  }
}
