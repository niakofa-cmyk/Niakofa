#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd "$script_dir/.." && pwd -P)"

: "${BASE_URL:?BASE_URL is required}"
: "${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
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
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Refusing production media E2E: EXPECTED_COMMIT must be a full 40-character Git commit SHA." >&2
  exit 2
fi
if [[ ! "$MEDIA_SMOKE_CONTEXT_ID" =~ ^[1-9][0-9]*$ ]]; then
  echo "Refusing production media E2E: MEDIA_SMOKE_CONTEXT_ID must be a positive integer." >&2
  exit 2
fi
retain_test_media="${MEDIA_CERT_RETAIN_TEST_MEDIA:-0}"
if [[ "$retain_test_media" != "0" && "$retain_test_media" != "1" ]]; then
  echo "Refusing production media E2E: MEDIA_CERT_RETAIN_TEST_MEDIA must be 0 or 1." >&2
  exit 2
fi
if [[ "$retain_test_media" == "1" ]]; then
  if [[ "${CONFIRM_RETAIN_PRODUCTION_MEDIA:-}" != "1" ]]; then
    echo "Refusing retained-media E2E: set CONFIRM_RETAIN_PRODUCTION_MEDIA=1 only after explicit approval." >&2
    exit 2
  fi
  if [[ "${MEDIA_CERT_PHOTO_ONLY_SMOKE:-}" != "1" ]]; then
    echo "Refusing retained-media E2E: retention is allowed only for the isolated photo-only diagnostic." >&2
    exit 2
  fi
fi
if [[ -z "${USER_B_STATE:-}" && -z "${USER_B_STATE_JSON:-}" ]]; then
  echo "Refusing production media E2E: USER_B_STATE or USER_B_STATE_JSON is required for isolation certification." >&2
  exit 2
fi

runtime_dir=""
cleanup() {
  if [[ -n "$runtime_dir" ]]; then rm -rf -- "$runtime_dir"; fi
}
trap cleanup EXIT

create_runtime_dir() {
  if [[ -z "$runtime_dir" ]]; then
    runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/niakofa-media.XXXXXX")"
    chmod 700 "$runtime_dir"
  fi
}

materialize_state_json() {
  local env_name="$1"
  local filename="$2"
  local json_value="${!env_name:-}"
  printf '%s' "$json_value" | node "$script_dir/materialize-storage-state.mjs" "$runtime_dir/$filename"
}

# Secret JSON may be supplied by a secure environment variable. Materialize it
# only for this process tree in a private runtime directory; never log it.
if [[ -n "${USER_A_STATE_JSON:-}" ]]; then
  if [[ -n "${USER_A_STATE:-}" ]]; then
    echo "Refusing production media E2E: use either USER_A_STATE_JSON or USER_A_STATE, not both." >&2
    exit 2
  fi
  create_runtime_dir
  USER_A_STATE="$(materialize_state_json USER_A_STATE_JSON user-a-state.json)"
  export USER_A_STATE
  unset USER_A_STATE_JSON
fi

if [[ -n "${USER_B_STATE_JSON:-}" ]]; then
  if [[ -n "${USER_B_STATE:-}" ]]; then
    echo "Refusing production media E2E: use either USER_B_STATE_JSON or USER_B_STATE, not both." >&2
    exit 2
  fi
  create_runtime_dir
  USER_B_STATE="$(materialize_state_json USER_B_STATE_JSON user-b-state.json)"
  export USER_B_STATE
  unset USER_B_STATE_JSON
fi

if [[ -z "${USER_A_STATE:-}" ]]; then
  if [[ "${CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE:-}" != "1" ]]; then
    echo "Refusing production media E2E: confirm the existing Railway state bucket has no public-read policy or CDN route." >&2
    exit 2
  fi
  if [[ "${CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE:-}" != "1" ]]; then
    echo "Refusing production media E2E: confirm the API and certification settings reference the same existing Railway media bucket." >&2
    exit 2
  fi
  state_key="${CERTIFICATION_STATE_KEY:-certification/user-a-state.json}"
  case "$state_key" in
    "test-auth/user-a/niakofa-state.json"|"certification/user-a-state.json") ;;
    *)
      echo "Refusing production media E2E: CERTIFICATION_STATE_KEY must be an approved fixed User A state key." >&2
      exit 2
      ;;
  esac
  create_runtime_dir
  USER_A_STATE="$runtime_dir/user-a-state.json"

  bucket_env=(env -i "PATH=$PATH" "HOME=${HOME:-/tmp}" "TMPDIR=${TMPDIR:-/tmp}")
  for name in \
    STORAGE_ENDPOINT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY STORAGE_BUCKET STORAGE_REGION STORAGE_CDN_URL \
    CERTIFICATION_S3_ENDPOINT CERTIFICATION_S3_ACCESS_KEY_ID CERTIFICATION_S3_SECRET_ACCESS_KEY \
    CERTIFICATION_S3_BUCKET CERTIFICATION_S3_REGION CERTIFICATION_S3_URL_STYLE; do
    value="${!name:-}"
    if [[ -n "$value" ]]; then bucket_env+=("$name=$value"); fi
  done
  "${bucket_env[@]}" node "$script_dir/railway-bucket-object.mjs" get "$state_key" "$USER_A_STATE"
  export USER_A_STATE
fi

: "${USER_A_STATE:?USER_A_STATE, USER_A_STATE_JSON, or Railway bucket certification state is required}"
: "${USER_B_STATE:?USER_B_STATE or USER_B_STATE_JSON is required for isolation certification}"

env -i PATH="$PATH" HOME="${HOME:-/tmp}" \
  node "$script_dir/validate-user-a-state.mjs" "$USER_A_STATE" USER_A_STATE
env -i PATH="$PATH" HOME="${HOME:-/tmp}" \
  node "$script_dir/validate-user-a-state.mjs" "$USER_B_STATE" USER_B_STATE

create_runtime_dir
mkdir -m 700 "$runtime_dir/playwright-output"

playwright_env=(
  env -i
  "PATH=$PATH"
  "HOME=${HOME:-/tmp}"
  "TMPDIR=${TMPDIR:-/tmp}"
  "PLAYWRIGHT_BASE_URL=$BASE_URL"
  "EXPECTED_COMMIT=$EXPECTED_COMMIT"
  "USER_A_STATE=$USER_A_STATE"
  "USER_B_STATE=$USER_B_STATE"
  "MEDIA_SMOKE_CONTEXT_KIND=$MEDIA_SMOKE_CONTEXT_KIND"
  "MEDIA_SMOKE_CONTEXT_ID=$MEDIA_SMOKE_CONTEXT_ID"
  "ALLOW_MEDIA_PRODUCTION_E2E=1"
  "CONFIRM_DISPOSABLE_ACCOUNT=1"
  "CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE=1"
  "MEDIA_PLATFORM_V21_BROWSER_SMOKE=1"
  "MEDIA_CERT_PHOTO_ONLY_SMOKE=${MEDIA_CERT_PHOTO_ONLY_SMOKE:-}"
  "MEDIA_CERT_RETAIN_TEST_MEDIA=$retain_test_media"
  "CONFIRM_RETAIN_PRODUCTION_MEDIA=${CONFIRM_RETAIN_PRODUCTION_MEDIA:-}"
)
if [[ -n "${PLAYWRIGHT_EXECUTABLE_PATH:-}" ]]; then
  playwright_env+=("PLAYWRIGHT_EXECUTABLE_PATH=$PLAYWRIGHT_EXECUTABLE_PATH")
elif [[ -x "/repl/tools/bin/chromium" ]]; then
  playwright_env+=("PLAYWRIGHT_EXECUTABLE_PATH=/repl/tools/bin/chromium")
fi

if [[ "${MEDIA_CERT_PHOTO_ONLY_SMOKE:-}" == "1" ]]; then
  if [[ "$retain_test_media" == "1" ]]; then
    echo "Running the gated photo-only diagnostic and retaining its verified Hub photo as explicitly approved."
  else
    echo "Running one gated authenticated production photo-only diagnostic for commit $EXPECTED_COMMIT..."
  fi
  "${playwright_env[@]}" "$repository_root/node_modules/.bin/playwright" test \
    "$repository_root/e2e/media-platform-authenticated.spec.ts" \
    --grep "photo-only diagnostic" \
    --reporter=line --output "$runtime_dir/playwright-output"
else
  echo "Running gated authenticated production media certification for commit $EXPECTED_COMMIT..."
  "${playwright_env[@]}" "$repository_root/node_modules/.bin/playwright" test \
    "$repository_root/e2e/media-platform-authenticated.spec.ts" \
    --reporter=line --output "$runtime_dir/playwright-output"
fi
