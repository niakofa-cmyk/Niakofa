import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";

const script = resolve("scripts/production-gate.mjs");
const baseEnv = {
  ...process.env,
  BASE_URL: "https://example.com",
  NIAKOFA_API_ORIGIN: "https://example.com",
};

function run(overrides = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...baseEnv, ...overrides },
  });
}

function runAsync(overrides = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [script], {
      env: { ...baseEnv, ...overrides },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

test("missing origins fail closed", () => {
  const r = run({ BASE_URL: undefined, NIAKOFA_API_ORIGIN: undefined });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing required environment variable: NIAKOFA_API_ORIGIN/);
});

test("non-http origins fail closed", () => {
  const r = run({ NIAKOFA_API_ORIGIN: "ftp://example.com" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /credential-free HTTP\(S\) origin/);
});

test("malformed origins fail closed", () => {
  const r = run({ NIAKOFA_API_ORIGIN: "not-a-url" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /credential-free HTTP\(S\) origin/);
});

test("origins with paths or credentials fail closed", () => {
  for (const baseUrl of ["https://example.com/a", "https://user@example.com"]) {
    const r = run({ BASE_URL: baseUrl });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /credential-free HTTP\(S\) origin/);
  }
});

test("BASE_URL must match the configured API origin", () => {
  const r = run({ BASE_URL: "https://other.example" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BASE_URL and NIAKOFA_API_ORIGIN/);
});

test("unsafe timeout values fail closed", () => {
  for (const timeout of ["0", "999", "60001", "invalid", "1.5"]) {
    const r = run({ GATE_TIMEOUT_MS: timeout });
    assert.equal(r.status, 2, `expected timeout ${timeout} to fail closed`);
    assert.match(r.stderr, /GATE_TIMEOUT_MS/);
  }
});

test("valid timeout boundaries are accepted by configuration validation", () => {
  // Use TEST-NET addresses so configuration validation is exercised without
  // depending on a real service. A timeout of 1000ms is valid.
  const r = run({
    GATE_TIMEOUT_MS: "1000",
    BASE_URL: "http://192.0.2.1",
    NIAKOFA_API_ORIGIN: "http://192.0.2.1",
  });
  assert.notEqual(r.status, 2);
});

test("a healthy API response passes the network gate", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", db: "connected" }));
  });

  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const r = await runAsync({
      BASE_URL: origin,
      NIAKOFA_API_ORIGIN: origin,
      GATE_TIMEOUT_MS: "1000",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Production gate network check passed/);
  } finally {
    await new Promise((resolveServer, rejectServer) => server.close((error) => error ? rejectServer(error) : resolveServer()));
  }
});

test("NIAKOFA_API_ORIGIN is sufficient when BASE_URL is not set", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", db: "connected" }));
  });

  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const r = await runAsync({
      BASE_URL: undefined,
      NIAKOFA_API_ORIGIN: origin,
      GATE_TIMEOUT_MS: "1000",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Production gate network check passed/);
  } finally {
    await new Promise((resolveServer, rejectServer) => server.close((error) => error ? rejectServer(error) : resolveServer()));
  }
});

test("production gate no longer depends on a separately deployed RPG", () => {
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /LEGACY_RPG_ORIGIN|rpgOrigin|launch-context/);
});
