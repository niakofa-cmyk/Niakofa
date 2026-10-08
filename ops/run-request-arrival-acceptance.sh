#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

: "${BASE_URL:?BASE_URL is required}"
: "${NIAKOFA_API_ORIGIN:?NIAKOFA_API_ORIGIN is required}"
: "${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"

for gate in ALLOW_MUTATING_E2E CONFIRM_DISPOSABLE_ACCOUNT ALLOW_REQUEST_ARRIVAL_E2E; do
  if [[ "${!gate:-}" != "1" ]]; then
    echo "Refusing requester/helper arrival acceptance: set ${gate}=1 explicitly." >&2
    exit 2
  fi
done

if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Refusing requester/helper arrival acceptance: EXPECTED_COMMIT must be the full 40-character Git SHA." >&2
  exit 2
fi

runtime_dir=""
cleanup() {
  if [[ -n "$runtime_dir" ]]; then
    rm -rf -- "$runtime_dir"
  fi
}
trap cleanup EXIT

materialized_state_path=""
materialize_state_json() {
  local env_name="$1"
  local file_name="$2"
  local json_value="${!env_name:-}"
  if [[ -z "$json_value" ]]; then
    return 0
  fi

  runtime_dir="${runtime_dir:-$(mktemp -d "${TMPDIR:-/tmp}/niakofa-arrival.XXXXXX")}"
  chmod 700 "$runtime_dir"
  materialized_state_path="$runtime_dir/$file_name"
  printf '%s' "$json_value" | node ops/materialize-storage-state.mjs "$materialized_state_path" >/dev/null
}

if [[ -z "${USER_A_STATE:-}" && -n "${USER_A_STATE_JSON:-}" ]]; then
  materialize_state_json USER_A_STATE_JSON user-a-state.json
  USER_A_STATE="$materialized_state_path"
  export USER_A_STATE
fi

if [[ -z "${USER_B_STATE:-}" && -n "${USER_B_STATE_JSON:-}" ]]; then
  materialize_state_json USER_B_STATE_JSON user-b-state.json
  USER_B_STATE="$materialized_state_path"
  export USER_B_STATE
fi

unset USER_A_STATE_JSON USER_B_STATE_JSON

: "${USER_A_STATE:?USER_A_STATE or USER_A_STATE_JSON is required}"
: "${USER_B_STATE:?USER_B_STATE or USER_B_STATE_JSON is required}"

node ops/validate-user-a-state.mjs "$USER_A_STATE" USER_A_STATE
node ops/validate-user-a-state.mjs "$USER_B_STATE" USER_B_STATE

BASE_URL="$BASE_URL" \
NIAKOFA_API_ORIGIN="$NIAKOFA_API_ORIGIN" \
EXPECTED_COMMIT="$EXPECTED_COMMIT" \
USER_A_STATE="$USER_A_STATE" \
USER_B_STATE="$USER_B_STATE" \
node --input-type=module <<'NODE'
import fs from "node:fs";

const base = new URL(process.env.BASE_URL);
const apiOrigin = new URL(process.env.NIAKOFA_API_ORIGIN);
const expectedCommit = process.env.EXPECTED_COMMIT.trim().toLowerCase();

for (const [name, url] of [["BASE_URL", base], ["NIAKOFA_API_ORIGIN", apiOrigin]]) {
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(`${name} must be a credential-free HTTP(S) origin.`);
  }
}
if (base.origin !== apiOrigin.origin) {
  throw new Error("BASE_URL and NIAKOFA_API_ORIGIN must have the same origin.");
}

function stateInfo(path) {
  const state = JSON.parse(fs.readFileSync(path, "utf8"));
  const origins = state.origins ?? [];
  const entries = origins.flatMap((origin) => origin.localStorage ?? []);
  const token = entries.find((entry) => entry.name === "niakofa_token")?.value;
  const userRaw = entries.find((entry) => entry.name === "niakofa_user")?.value;
  const user = userRaw ? JSON.parse(userRaw) : null;
  const userId = Number(user?.id);

  if (!token || !Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error(`Invalid authenticated storage state: ${path}`);
  }
  const stateOrigins = new Set(origins.map((origin) => new URL(origin.origin).origin));
  if (!stateOrigins.has(base.origin)) {
    throw new Error(`Storage state does not contain the BASE_URL origin: ${path}`);
  }
  return { token, userId };
}

const requester = stateInfo(process.env.USER_A_STATE);
const helper = stateInfo(process.env.USER_B_STATE);
if (requester.userId === helper.userId) {
  throw new Error("Requester and helper storage states must belong to different accounts.");
}

async function get(pathname, token) {
  const response = await fetch(new URL(pathname, base), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return body;
}

const [version, readiness, requesterUser, helperUser] = await Promise.all([
  get("/api/version", requester.token),
  get("/api/readiness", requester.token),
  get(`/api/users/${requester.userId}`, requester.token),
  get(`/api/users/${helper.userId}`, helper.token),
]);
const servedCommit = String(version.commit ?? "").trim().toLowerCase();

if (!/^[0-9a-f]{40}$/.test(servedCommit) || servedCommit !== expectedCommit) {
  throw new Error(`Served commit ${servedCommit || "unknown"} does not equal EXPECTED_COMMIT.`);
}
if (readiness.ready !== true || readiness.status !== "ready") {
  throw new Error("Deployed readiness is not ready.");
}
if (requesterUser.approval_status !== "approved" || helperUser.approval_status !== "approved") {
  throw new Error("Both requester and helper accounts must be approved.");
}
if (Number(requesterUser.id) !== requester.userId || Number(helperUser.id) !== helper.userId) {
  throw new Error("Authenticated account identity does not match its storage state.");
}

console.log(`PASS: arrival acceptance preflight ready (commit ${servedCommit})`);
console.log("PASS: distinct approved requester/helper accounts");
NODE

if [[ -z "${PLAYWRIGHT_EXECUTABLE_PATH:-}" && -x "/repl/tools/bin/chromium" ]]; then
  export PLAYWRIGHT_EXECUTABLE_PATH="/repl/tools/bin/chromium"
fi

export PLAYWRIGHT_BASE_URL="$BASE_URL"
export PLAYWRIGHT_VIDEO="${PLAYWRIGHT_VIDEO:-off}"

echo "Running requester/helper arrival browser acceptance..."
corepack pnpm exec playwright test e2e/request-arrival-live.spec.ts --reporter=line