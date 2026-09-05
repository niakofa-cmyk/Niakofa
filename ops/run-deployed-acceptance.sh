#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${NIAKOFA_API_ORIGIN:?NIAKOFA_API_ORIGIN is required}"
: "${EXPECTED_COMMIT:?EXPECTED_COMMIT is required to prevent testing the wrong deployment}"

if [[ "${ALLOW_MUTATING_E2E:-}" != "1" ]]; then
  echo "Refusing live acceptance: set ALLOW_MUTATING_E2E=1 explicitly." >&2
  exit 2
fi

if [[ "${CONFIRM_DISPOSABLE_ACCOUNT:-}" != "1" ]]; then
  echo "Refusing live acceptance: set CONFIRM_DISPOSABLE_ACCOUNT=1 only for an approved disposable account." >&2
  exit 2
fi

if [[ "${ALLOW_COUNTY_TRAVEL_E2E:-}" != "1" ]]; then
  echo "Refusing county-travel acceptance: set ALLOW_COUNTY_TRAVEL_E2E=1 explicitly." >&2
  exit 2
fi

if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "Refusing live acceptance: EXPECTED_COMMIT must be a 7-40 character Git commit SHA." >&2
  exit 2
fi

runtime_dir=""
cleanup() {
  [[ -n "$runtime_dir" ]] && rm -rf -- "$runtime_dir"
}
trap cleanup EXIT

# Secret JSON is never logged or persisted in the checkout. Materialize it only
# for this process tree in a private runtime directory.
if [[ -n "${USER_A_STATE_JSON:-}" ]]; then
  if [[ -n "${USER_A_STATE:-}" ]]; then
    echo "Refusing live acceptance: use either USER_A_STATE_JSON or USER_A_STATE, not both." >&2
    exit 2
  fi
  runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/niakofa-acceptance.XXXXXX")"
  chmod 700 "$runtime_dir"
  USER_A_STATE="$runtime_dir/user-a-state.json"
  umask 077
  printf '%s' "$USER_A_STATE_JSON" > "$USER_A_STATE"
  chmod 600 "$USER_A_STATE"
  export USER_A_STATE
fi

: "${USER_A_STATE:?USER_A_STATE or USER_A_STATE_JSON is required}"
node ops/validate-user-a-state.mjs "$USER_A_STATE" USER_A_STATE
if [[ -n "${USER_B_STATE:-}" ]]; then
  node ops/validate-user-a-state.mjs "$USER_B_STATE" USER_B_STATE
fi

BASE_URL="$BASE_URL" NIAKOFA_API_ORIGIN="$NIAKOFA_API_ORIGIN" USER_A_STATE="$USER_A_STATE" USER_B_STATE="${USER_B_STATE:-}" EXPECTED_COMMIT="$EXPECTED_COMMIT" node --input-type=module <<'NODE'
import fs from "node:fs";

let base, apiOrigin;
try {
  base = new URL(process.env.BASE_URL);
  apiOrigin = new URL(process.env.NIAKOFA_API_ORIGIN);
} catch {
  throw new Error("BASE_URL and NIAKOFA_API_ORIGIN must be valid http(s) URLs");
}
for (const [name, url] of [["BASE_URL", base], ["NIAKOFA_API_ORIGIN", apiOrigin]]) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${name} must be a credential-free http(s) origin without path, query, or hash`);
  }
}
if (base.origin !== apiOrigin.origin) {
  throw new Error("BASE_URL and NIAKOFA_API_ORIGIN must have the same origin for deployed acceptance");
}
const state = JSON.parse(fs.readFileSync(process.env.USER_A_STATE, "utf8"));
const entries = state.origins.flatMap((origin) => origin.localStorage ?? []);
const token = entries.find((entry) => entry.name === "niakofa_token")?.value;
const userJson = entries.find((entry) => entry.name === "niakofa_user")?.value;
const user = userJson ? JSON.parse(userJson) : null;

if (!token || !Number.isInteger(Number(user?.id))) {
  throw new Error("storage state does not contain an authenticated Niakofa user");
}
if (process.env.USER_B_STATE) {
  const stateB = JSON.parse(fs.readFileSync(process.env.USER_B_STATE, "utf8"));
  const bEntries = stateB.origins.flatMap((origin) => origin.localStorage ?? []);
  const tokenB = bEntries.find((entry) => entry.name === "niakofa_token")?.value;
  const userBJson = bEntries.find((entry) => entry.name === "niakofa_user")?.value;
  const userB = userBJson ? JSON.parse(userBJson) : null;
  if (!tokenB || !Number.isInteger(Number(userB?.id))) {
    throw new Error("USER_B_STATE does not contain an authenticated Niakofa user");
  }
  if (Number(user.id) === Number(userB.id)) {
    throw new Error("USER_A_STATE and USER_B_STATE must belong to different accounts");
  }
}
const stateOrigins = new Set(state.origins.map((origin) => new URL(origin.origin).origin));
if (!stateOrigins.has(base.origin)) {
  throw new Error(`USER_A_STATE does not contain the BASE_URL origin (${base.origin})`);
}
const stateBOrigins = new Set(stateB.origins.map((origin) => new URL(origin.origin).origin));
if (!stateBOrigins.has(base.origin)) {
  throw new Error(`USER_B_STATE does not contain the BASE_URL origin (${base.origin})`);
}

async function get(pathname, bearerToken = token) {
  const response = await fetch(new URL(pathname, base), {
    headers: { Accept: "application/json", Authorization: `Bearer ${bearerToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return body;
}

const [version, readiness, verifiedUser, verifiedUserB] = await Promise.all([
  get("/api/version"),
  get("/api/readiness"),
  get(`/api/users/${Number(user.id)}`),
  get(`/api/users/${Number(userB.id)}`, tokenB),
]);

const deployedCommit = typeof version.commit === "string" ? version.commit.trim().toLowerCase() : "";
const expectedCommit = process.env.EXPECTED_COMMIT.trim().toLowerCase();
if (
  !deployedCommit ||
  !(deployedCommit.startsWith(expectedCommit) || expectedCommit.startsWith(deployedCommit))
) {
  throw new Error(`deployed commit ${deployedCommit || "unknown"} does not match EXPECTED_COMMIT ${expectedCommit}`);
}
if (readiness.ready !== true || readiness.status !== "ready") {
  throw new Error("deployed readiness is not ready");
}
if (verifiedUser.approval_status !== "approved") {
  throw new Error("USER_A_STATE belongs to an account that is not approved");
}
if (verifiedUserB.approval_status !== "approved") {
  throw new Error("USER_B_STATE belongs to an account that is not approved");
}

console.log(`PASS: deployed preflight ready (commit ${deployedCommit})`);
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

echo "Running explicitly permitted county-travel acceptance..."
corepack pnpm exec playwright test e2e/county-travel-live.spec.ts --reporter=line