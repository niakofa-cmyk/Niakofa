import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve("scripts/production-gate.mjs");
const baseEnv = {
  ...process.env,
  BASE_URL: "https://example.com",
  NIAKOFA_API_ORIGIN: "https://example.com",
  LEGACY_RPG_ORIGIN: "https://example.org",
};

function run(overrides = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...baseEnv, ...overrides },
  });
}

test("missing origins fail closed", () => {
  const r = run({ BASE_URL: undefined, NIAKOFA_API_ORIGIN: undefined, LEGACY_RPG_ORIGIN: undefined });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing required environment variable/);
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
    LEGACY_RPG_ORIGIN: "http://192.0.2.2",
  });
  assert.notEqual(r.status, 2);
});

test("production CORS preflight requires strict response-header validation", () => {
  // The live network gate performs the authoritative header assertion. This
  // regression test ensures the assertion remains present in future edits.
  const source = readFileSync(script, "utf8");
  assert.match(source, /access-control-allow-origin/);
  assert.match(source, /access-control-allow-credentials/);
  assert.match(source, /access-control-allow-methods/);
  assert.match(source, /access-control-allow-headers/);
  assert.match(source, /vary/);
  assert.match(source, /rpgOrigin\.origin/);
});
