import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

const token = "7.1700000000000.0.signature";

async function startMockApi(approvalStatus) {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/users/login") {
      response.end(JSON.stringify({
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

function runValidator(statePath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["ops/validate-user-a-state.mjs", statePath]);
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

test("generates a verified approved storage state without leaking the password", async () => {
  const server = await startMockApi("approved");
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

test("refuses a pending account before writing storage state", async () => {
  const server = await startMockApi("pending");
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