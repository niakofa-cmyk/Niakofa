#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
runtime_dir=""
cleanup() {
  if [[ -n "$runtime_dir" ]]; then rm -rf -- "$runtime_dir"; fi
}
trap cleanup EXIT

# Secret JSON may be supplied by a secure environment variable. Materialize it
# only for this process tree in a private runtime directory; never log it.
if [[ -n "${USER_A_STATE_JSON:-}" ]]; then
  if [[ -n "${USER_A_STATE:-}" ]]; then
    echo "Refusing production media E2E: use either USER_A_STATE_JSON or USER_A_STATE, not both." >&2
    exit 2
  fi
  runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/niakofa-media.XXXXXX")"
  chmod 700 "$runtime_dir"
  USER_A_STATE="$runtime_dir/user-a-state.json"
  umask 077
  printf '%s' "$USER_A_STATE_JSON" > "$USER_A_STATE"
  chmod 600 "$USER_A_STATE"
  export USER_A_STATE
fi

if [[ -n "${USER_B_STATE_JSON:-}" ]]; then
  if [[ -n "${USER_B_STATE:-}" ]]; then
    echo "Refusing production media E2E: use either USER_B_STATE_JSON or USER_B_STATE, not both." >&2
    exit 2
  fi
  if [[ -z "$runtime_dir" ]]; then
    runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/niakofa-media.XXXXXX")"
    chmod 700 "$runtime_dir"
  fi
  USER_B_STATE="$runtime_dir/user-b-state.json"
  umask 077
  printf '%s' "$USER_B_STATE_JSON" > "$USER_B_STATE"
  chmod 600 "$USER_B_STATE"
  export USER_B_STATE
fi

: "${USER_A_STATE:?USER_A_STATE or USER_A_STATE_JSON is required}"
: "${MEDIA_SMOKE_CONTEXT_KIND:?MEDIA_SMOKE_CONTEXT_KIND is required}"
: "${MEDIA_SMOKE_CONTEXT_ID:?MEDIA_SMOKE_CONTEXT_ID is required}"

if [[ "${ALLOW_MEDIA_PRODUCTION_E2E:-}" != "1" ]]; then
  echo "Refusing production media E2E: set ALLOW_MEDIA_PRODUCTION_E2E=1 explicitly." >&2
  exit 2
fi
if [[ "${CONFIRM_DISPOSABLE_ACCOUNT:-}" != "1" ]]; then
  echo "Refusing production media E2E: set CONFIRM_DISPOSABLE_ACCOUNT=1 only for an approved disposable account." >&2
  exit 2
fi
if [[ "${CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE:-}" != "1" ]]; then
  echo "Refusing production media E2E: set CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE=1 only after deliberate V21 activation." >&2
  exit 2
fi
if [[ "${MEDIA_PLATFORM_V21_BROWSER_SMOKE:-}" != "1" ]]; then
  echo "Refusing production media E2E: set MEDIA_PLATFORM_V21_BROWSER_SMOKE=1 explicitly." >&2
  exit 2
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "Refusing production media E2E: EXPECTED_COMMIT must be a 7-40 character Git commit SHA." >&2
  exit 2
fi
if [[ ! "$MEDIA_SMOKE_CONTEXT_ID" =~ ^[1-9][0-9]*$ ]]; then
  echo "Refusing production media E2E: MEDIA_SMOKE_CONTEXT_ID must be a positive integer." >&2
  exit 2
fi

node ops/validate-user-a-state.mjs "$USER_A_STATE" USER_A_STATE
if [[ -n "${USER_B_STATE:-}" ]]; then
  node ops/validate-user-a-state.mjs "$USER_B_STATE" USER_B_STATE
fi

export PLAYWRIGHT_BASE_URL="$BASE_URL"
if [[ -z "${PLAYWRIGHT_EXECUTABLE_PATH:-}" && -x "/repl/tools/bin/chromium" ]]; then
  export PLAYWRIGHT_EXECUTABLE_PATH="/repl/tools/bin/chromium"
fi

echo "Running gated authenticated production media certification for commit $EXPECTED_COMMIT..."
corepack pnpm exec playwright test e2e/media-platform-authenticated.spec.ts --reporter=line