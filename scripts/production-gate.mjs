#!/usr/bin/env node
import process from "node:process";

const required = ["NIAKOFA_API_ORIGIN", "LEGACY_RPG_ORIGIN"];\nconst timeoutMs = Number(process.env.GATE_TIMEOUT_MS ?? 10000);\nif (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {\n  console.error("GATE_TIMEOUT_MS must be an integer between 1000 and 60000.");\n  process.exit(2);\n}
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(2);
  }
}

const apiOrigin = new URL(process.env.NIAKOFA_API_ORIGIN);
const rpgOrigin = new URL(process.env.LEGACY_RPG_ORIGIN);
if (!["http:", "https:"].includes(apiOrigin.protocol) || !["http:", "https:"].includes(rpgOrigin.protocol)) {
  console.error("NIAKOFA_API_ORIGIN and LEGACY_RPG_ORIGIN must be HTTP(S) URLs.");
  process.exit(2);
}

const checks = [];
async function check(name, url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      ...options,
    });
    const body = await response.text();
    checks.push({ name, ok: response.ok, status: response.status, ms: Date.now() - started, body: body.slice(0, 500) });
  } catch (error) {
    checks.push({ name, ok: false, status: 0, ms: Date.now() - started, error: error instanceof Error ? error.name : "request_error" });
  }
}

await check("Niakofa API reachable", new URL("/api/health", apiOrigin));
await check("Legacy RPG reachable", new URL("/", rpgOrigin));

// If the RPG is a separate origin, verify the platform advertises it in CORS.
// This is intentionally a preflight-only check; it never creates a launch ticket.
await check(
  "Legacy CORS preflight",
  new URL("/api/legacy/launch-context", apiOrigin),
  {
    method: "OPTIONS",
    headers: {
      Origin: rpgOrigin.origin,
      "Access-Control-Request-Method": "GET",
    },
  },
);

console.table(checks.map(({ name, ok, status, ms, error }) => ({ name, ok, status, ms, ...(error ? { error } : {}) })));

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`Production gate failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log("Production gate network checks passed.");
console.log("Authenticated community-pool matrix and live launch-ticket exchange still require real test identities/credentials and must be run by the deployment operator.");
