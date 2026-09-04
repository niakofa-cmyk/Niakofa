#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${USER_A_STATE:?USER_A_STATE must point to a storage-state JSON file}"

if [[ "${ALLOW_MUTATING_E2E:-}" != "1" ]]; then
  echo "Refusing live acceptance: set ALLOW_MUTATING_E2E=1 explicitly." >&2
  exit 2
fi

if [[ ! -f "$USER_A_STATE" ]]; then
  echo "Refusing live acceptance: USER_A_STATE is not a readable file path." >&2
  exit 2
fi

node ops/validate-user-a-state.mjs "$USER_A_STATE"

BASE_URL="$BASE_URL" USER_A_STATE="$USER_A_STATE" node --input-type=module <<'NODE'
import fs from "node:fs";

let base;
try {
  base = new URL(process.env.BASE_URL);
} catch {
  throw new Error("BASE_URL must be a valid http(s) URL");
}
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
  throw new Error("BASE_URL must be a credential-free http(s) origin without query or hash");
}
const state = JSON.parse(fs.readFileSync(process.env.USER_A_STATE, "utf8"));
const entries = state.origins.flatMap((origin) => origin.localStorage ?? []);
const token = entries.find((entry) => entry.name === "niakofa_token")?.value;
const userJson = entries.find((entry) => entry.name === "niakofa_user")?.value;
const user = userJson ? JSON.parse(userJson) : null;

if (!token || !Number.isInteger(Number(user?.id))) {
  throw new Error("storage state does not contain an authenticated Niakofa user");
}
const stateOrigins = new Set(state.origins.map((origin) => new URL(origin.origin).origin));
if (!stateOrigins.has(base.origin)) {
  throw new Error(`USER_A_STATE does not contain the BASE_URL origin (${base.origin})`);
}

async function get(pathname) {
  const response = await fetch(new URL(pathname, base), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return body;
}

const [version, readiness, verifiedUser] = await Promise.all([
  get("/api/version"),
  get("/api/readiness"),
  get(`/api/users/${Number(user.id)}`),
]);

if (readiness.ready !== true || readiness.status !== "ready") {
  throw new Error("deployed readiness is not ready");
}
if (verifiedUser.approval_status !== "approved") {
  throw new Error("USER_A_STATE belongs to an account that is not approved");
}

console.log(`PASS: deployed preflight ready (commit ${version.commit ?? "unknown"})`);
NODE

if [[ -z "${PLAYWRIGHT_EXECUTABLE_PATH:-}" && -x "/repl/tools/bin/chromium" ]]; then
  export PLAYWRIGHT_EXECUTABLE_PATH="/repl/tools/bin/chromium"
fi

export PLAYWRIGHT_BASE_URL="$BASE_URL"
export PLAYWRIGHT_VIDEO="${PLAYWRIGHT_VIDEO:-off}"

echo "Running authenticated non-mutating Diaspora journeys..."
corepack pnpm exec playwright test e2e/diaspora-journeys-staging.spec.ts --reporter=line

echo "Running explicitly permitted mutating Diaspora acceptance..."
corepack pnpm exec playwright test e2e/diaspora-final-wiring-live.spec.ts --reporter=line