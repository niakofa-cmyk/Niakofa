import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, rmdir, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import { once } from "node:events";
import test from "node:test";
import { readHiddenPassword } from "./read-hidden-password.mjs";

const token = "7.1700000000000.0.signature";

async function startMockApi({
  approvalStatus = "approved",
  loginStatus = 200,
  loginBody,
} = {}) {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/users/login") {
      response.statusCode = loginStatus;
      response.end(JSON.stringify(loginBody ?? {
        token,
        user: { id: 7, approval_status: approvalStatus },
      }));
      return;
    }
    if (request.url === "/api/users/7") {
      response.end(JSON.stringify({ id: 7, approval_status: approvalStatus }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

function runGenerator(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["ops/generate-user-a-state.mjs"], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function runValidator(statePath, requiredOrigin) {
  return new Promise((resolve) => {
    const args = ["ops/validate-user-a-state.mjs", statePath];
    if (requiredOrigin) args.push("USER_A_STATE", requiredOrigin);
    const child = spawn(process.execPath, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

const validState = {
  cookies: [],
  origins: [{
    origin: "https://example.test",
    localStorage: [
      { name: "niakofa_token", value: token },
      { name: "niakofa_user", value: JSON.stringify({ id: 7 }) },
    ],
  }],
};

test("hidden password prompt does not echo typed characters", async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (enabled) => { input.isRaw = enabled; };
  let outputText = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      outputText += chunk.toString();
      callback();
    },
  });
  output.isTTY = true;

  try {
    const result = readHiddenPassword({ input, output });
    input.write("fixture-password!");
    input.write("\u007f");
    input.write("\r");
    assert.equal(await result, "fixture-password");
    assert.equal(outputText, "Password: \n");
    assert.equal(input.isRaw, false);
  } finally {
    input.destroy();
    output.destroy();
  }
});

test("validator rejects weak-permission and symbolic-link state files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-state-test-"));
  const statePath = path.join(tempDir, "state.json");
  const linkPath = path.join(tempDir, "state-link.json");
  try {
    await writeFile(statePath, JSON.stringify(validState), { mode: 0o644 });
    const weak = await runValidator(statePath);
    assert.notEqual(weak.status, 0);
    assert.match(weak.stderr, /permissions must be 0600/);

    await chmod(statePath, 0o600);
    await symlink(statePath, linkPath);
    const linked = await runValidator(linkPath);
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /symbolic links/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("validator accepts a private state file under the ignored workspace .auth directory", async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const authDirectory = path.join(repositoryRoot, ".auth");
  let createdAuthDirectory = false;
  let stateDirectory;

  try {
    try {
      const directoryInfo = await lstat(authDirectory);
      assert.ok(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(authDirectory, { mode: 0o700 });
      createdAuthDirectory = true;
    }

    stateDirectory = await mkdtemp(path.join(authDirectory, "validation-test-"));
    const statePath = path.join(stateDirectory, "state.json");
    await writeFile(statePath, JSON.stringify(validState), { mode: 0o600 });

    const result = await runValidator(statePath);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    if (stateDirectory) await rm(stateDirectory, { recursive: true, force: true });
    if (createdAuthDirectory) await rmdir(authDirectory).catch(() => {});
  }
});

test("validator can require Niakofa authentication entries on a specific origin", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-state-test-"));
  const statePath = path.join(tempDir, "state.json");
  try {
    await writeFile(statePath, JSON.stringify(validState), { mode: 0o600 });

    const matchingOrigin = await runValidator(statePath, "https://example.test");
    assert.equal(matchingOrigin.status, 0, matchingOrigin.stderr);

    const mismatchedOrigin = await runValidator(statePath, "https://niakofa.com");
    assert.notEqual(mismatchedOrigin.status, 0);
    assert.match(mismatchedOrigin.stderr, /state does not contain the required origin/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("validator continues to reject state files elsewhere inside the repository", async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const statePath = path.join(repositoryRoot, `.state-validation-${process.pid}.json`);
  try {
    await writeFile(statePath, JSON.stringify(validState), { mode: 0o600 });
    const result = await runValidator(statePath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /in-repository state files are not allowed/);
  } finally {
    await rm(statePath, { force: true });
  }
});

test("generates a verified approved storage state without leaking the password", async () => {
  const server = await startMockApi({ approvalStatus: "approved" });
  const port = server.address().port;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-state-test-"));
  const outputPath = path.join(tempDir, "user-a.json");
  const password = "never-print-this-password";

  try {
    const result = await runGenerator({
      BASE_URL: `http://127.0.0.1:${port}`,
      DISPOSABLE_EMAIL: "approved@example.test",
      DISPOSABLE_PASSWORD: password,
      OUT: outputPath,
      CONFIRM_DISPOSABLE_ACCOUNT: "1",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS: storage state written/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(password));

    const state = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(state.origins[0].localStorage.find((entry) => entry.name === "niakofa_token").value, token);
    assert.equal((await stat(outputPath)).mode & 0o077, 0);
  } finally {
    server.close();
    await once(server, "close");
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("reports safe 401 diagnostics without echoing credentials or response text", async () => {
  const password = "fixture-password-for-401";
  const server = await startMockApi({
    loginStatus: 401,
    loginBody: {
      error: `Unsafe echoed detail: ${password}`,
      error_code: "INVALID_CREDENTIALS",
    },
  });
  const port = server.address().port;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-state-test-"));
  const outputPath = path.join(tempDir, "user-a.json");

  try {
    const result = await runGenerator({
      BASE_URL: `http://127.0.0.1:${port}`,
      DISPOSABLE_EMAIL: "approved@example.test",
      DISPOSABLE_PASSWORD: password,
      OUT: outputPath,
      CONFIRM_DISPOSABLE_ACCOUNT: "1",
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /HTTP 401/);
    assert.match(result.stderr, /code=INVALID_CREDENTIALS/);
    assert.match(result.stderr, /authentication was rejected/);
    assert.doesNotMatch(output, new RegExp(password));
    assert.doesNotMatch(output, /Unsafe echoed detail/);
    await assert.rejects(readFile(outputPath));
  } finally {
    server.close();
    await once(server, "close");
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("reports safe account-lockout retry information without response text", async () => {
  const password = "fixture-password-for-429";
  const server = await startMockApi({
    loginStatus: 429,
    loginBody: {
      error: `Unsafe echoed detail: ${password}`,
      error_code: "ACCOUNT_LOCKED",
      retry_after_sec: 30,
    },
  });
  const port = server.address().port;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-state-test-"));
  const outputPath = path.join(tempDir, "user-a.json");

  try {
    const result = await runGenerator({
      BASE_URL: `http://127.0.0.1:${port}`,
      DISPOSABLE_EMAIL: "approved@example.test",
      DISPOSABLE_PASSWORD: password,
      OUT: outputPath,
      CONFIRM_DISPOSABLE_ACCOUNT: "1",
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /HTTP 429/);
    assert.match(result.stderr, /code=ACCOUNT_LOCKED/);
    assert.match(result.stderr, /retry_after_sec=30/);
    assert.doesNotMatch(output, new RegExp(password));
    assert.doesNotMatch(output, /Unsafe echoed detail/);
    await assert.rejects(readFile(outputPath));
  } finally {
    server.close();
    await once(server, "close");
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("refuses a pending account before writing storage state", async () => {
  const server = await startMockApi({ approvalStatus: "pending" });
  const port = server.address().port;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-state-test-"));
  const outputPath = path.join(tempDir, "user-a.json");

  try {
    const result = await runGenerator({
      BASE_URL: `http://127.0.0.1:${port}`,
      DISPOSABLE_EMAIL: "pending@example.test",
      DISPOSABLE_PASSWORD: "not-persisted",
      OUT: outputPath,
      CONFIRM_DISPOSABLE_ACCOUNT: "1",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not approved/);
    await assert.rejects(readFile(outputPath));
  } finally {
    server.close();
    await once(server, "close");
    await rm(tempDir, { recursive: true, force: true });
  }
});