#!/usr/bin/env node
import process from "node:process";

const required = ["NIAKOFA_API_ORIGIN", "LEGACY_RPG_ORIGIN"];
const timeoutMs = Number(process.env.GATE_TIMEOUT_MS ?? 10000);

if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
  console.error("GATE_TIMEOUT_MS must be an integer between 1000 and 60000.");
  process.exit(2);
}

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(2);
  }
}

function parseOrigin(name) {
  try {
    const origin = new URL(process.env[name]);
    if (!["http:", "https:"].includes(origin.protocol)) {
      throw new Error("unsupported_protocol");
    }
    return origin;
  } catch {
    console.error(`${name} must be a valid HTTP(S) URL.`);
    process.exit(2);
  }
}

const apiOrigin = parseOrigin("NIAKOFA_API_ORIGIN");
const rpgOrigin = parseOrigin("LEGACY_RPG_ORIGIN");

const checks = [];

function headerTokens(value) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  );
}

function headerContainsAll(value, expected) {
  const actual = headerTokens(value);
  return expected.every((token) => actual.has(token.toLowerCase()));
}

async function check(name, url, options = {}, validate = () => true) {
  const started = Date.now();

  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      ...options,
    });

    let ok = response.ok;
    let error;

    try {
      const validation = validate(response);
      ok = ok && validation.ok;
      error = validation.error;
    } catch (validationError) {
      ok = false;
      error = validationError instanceof Error ? validationError.message : "validation_error";
    }

    checks.push({
      name,
      ok,
      status: response.status,
      ms: Date.now() - started,
      ...(error ? { error } : {}),
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error instanceof Error ? error.name : "request_error",
    });
  }
}

await check("Niakofa API reachable", new URL("/api/health", apiOrigin));
await check("Legacy RPG reachable", new URL("/", rpgOrigin));

// The Legacy RPG is hosted separately and uses credentials/cross-origin fetches.
// Verify the actual preflight response, not merely that OPTIONS returns 2xx.
const requestedHeaders = ["content-type", "authorization", "idempotency-key", "x-client-info"];
await check(
  "Legacy CORS preflight",
  new URL("/api/legacy/launch-context", apiOrigin),
  {
    method: "OPTIONS",
    headers: {
      Origin: rpgOrigin.origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": requestedHeaders.join(", "),
    },
  },
  (response) => {
    const allowOrigin = response.headers.get("access-control-allow-origin");
    const allowCredentials = response.headers.get("access-control-allow-credentials");
    const allowMethods = response.headers.get("access-control-allow-methods");
    const allowHeaders = response.headers.get("access-control-allow-headers");
    const vary = response.headers.get("vary");

    const failures = [];
    if (allowOrigin !== rpgOrigin.origin) failures.push("Access-Control-Allow-Origin");
    if (allowCredentials !== "true") failures.push("Access-Control-Allow-Credentials");
    if (!headerContainsAll(allowMethods, ["GET"])) failures.push("Access-Control-Allow-Methods");
    if (!headerContainsAll(allowHeaders, requestedHeaders)) failures.push("Access-Control-Allow-Headers");
    if (!headerContainsAll(vary, ["Origin"])) failures.push("Vary: Origin");

    return {
      ok: failures.length === 0,
      ...(failures.length ? { error: `Missing or incorrect CORS header(s): ${failures.join(", ")}` } : {}),
    };
  },
);

console.table(checks);

const failed = checks.filter((checkResult) => !checkResult.ok);
if (failed.length) {
  console.error(`Production gate failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log("Production gate network and CORS checks passed.");
console.log(
  "Authenticated community-pool matrix and live launch-ticket exchange still require real test identities/credentials and must be run by the deployment operator.",
);
