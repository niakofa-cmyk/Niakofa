#!/usr/bin/env node
import process from "node:process";

const required = ["BASE_URL", "NIAKOFA_API_ORIGIN"];
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
    if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("not_an_origin");
    }
    return origin;
  } catch {
    console.error(`${name} must be a credential-free HTTP(S) origin without path, query, or hash.`);
    process.exit(2);
  }
}

const apiOrigin = parseOrigin("NIAKOFA_API_ORIGIN");
const baseUrl = parseOrigin("BASE_URL");
if (baseUrl.origin !== apiOrigin.origin) {
  console.error("BASE_URL and NIAKOFA_API_ORIGIN must have the same origin.");
  process.exit(2);
}

const checks = [];

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

console.table(checks);

const failed = checks.filter((checkResult) => !checkResult.ok);
if (failed.length) {
  console.error(`Production gate failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log("Production gate network check passed.");
console.log(
  "Authenticated community-pool matrix still requires real test identities/credentials and must be run by the deployment operator.",
);
