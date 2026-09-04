import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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