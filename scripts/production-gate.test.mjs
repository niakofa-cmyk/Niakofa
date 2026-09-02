import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve("scripts/production-gate.mjs");
const baseEnv = {
  ...process.env,
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
  const r = run({ NIAKOFA_API_ORIGIN: undefined, LEGACY_RPG_ORIGIN: undefined });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing required environment variable/);
});

test("non-http origins fail closed", () => {
  const r = run({ NIAKOFA_API_ORIGIN: "ftp://example.com" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /valid HTTP\(S\) URL/);
});

test("malformed origins fail closed", () => {
  const r = run({ NIAKOFA_API_ORIGIN: "not-a-url" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /valid HTTP\(S\) URL/);
});

test("unsafe timeout values fail closed", () => {
  for (const timeout of ["0", "999", "60001", "invalid", "1.5"]) {
    const r = run({ GATE_TIMEOUT_MS: timeout });
    assert.equal(r.status, 2, `expected timeout ${timeout} to fail closed`);
    assert.match(r.stderr, /GATE_TIMEOUT_MS/);
  }
});

test("valid timeout boundaries are accepted by configuration validation", () => {
  // Use an unroutable address so the test exercises startup validation without
  // depending on a live production service. A timeout of 1000ms is valid.
  const r = run({
    GATE_TIMEOUT_MS: "1000",
    NIAKOFA_API_ORIGIN: "http://192.0.2.1",
    LEGACY_RPG_ORIGIN: "http://192.0.2.2",
  });
  assert.notEqual(r.status, 2);
});
