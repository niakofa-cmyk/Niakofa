#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd "$script_dir/.." && pwd -P)"
object_key="test-auth/user-a/niakofa-state.json"
runtime_dir=""

cleanup() {
  if [[ -n "$runtime_dir" ]]; then rm -rf -- "$runtime_dir"; fi
}
trap cleanup EXIT

unset USER_A_STATE USER_A_STATE_JSON USER_B_STATE USER_B_STATE_JSON

: "${BASE_URL:?BASE_URL is required}"
: "${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
: "${ALLOW_FAMILY_STORY_READONLY_E2E:?Set ALLOW_FAMILY_STORY_READONLY_E2E=1 to run the read-only production playback check}"
: "${CONFIRM_DISPOSABLE_ACCOUNT:?Confirm User A is the approved test account}"
: "${CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE:?Confirm the Railway state bucket has no public-read policy or CDN route}"
: "${CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE:?Confirm the API service storage variables reference niakofa-production-media}"

if [[ "$ALLOW_FAMILY_STORY_READONLY_E2E" != "1" ||
      "$CONFIRM_DISPOSABLE_ACCOUNT" != "1" ||
      "$CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE" != "1" ||
      "$CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE" != "1" ]]; then
  echo "Refusing production playback verification without explicit read-only, test-account, private-bucket, and bucket-reference confirmations." >&2
  exit 2
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Refusing Family Story playback: EXPECTED_COMMIT must be the full deployed commit SHA." >&2
  exit 2
fi
if ! node --input-type=module -e '
  try {
    const target = new URL(process.argv[1]);
    if (target.origin !== "https://niakofa.com" || target.pathname !== "/" ||
        target.search || target.hash || target.username || target.password) process.exit(1);
  } catch {
    process.exit(1);
  }
' "$BASE_URL"; then
  echo "Refusing Family Story playback: BASE_URL must be exactly https://niakofa.com." >&2
  exit 2
fi
for id_name in FAMILY_ID FAMILY_STORY_ID; do
  id_value="${!id_name:-}"
  if [[ -n "$id_value" && ! "$id_value" =~ ^[1-9][0-9]*$ ]]; then
    echo "Refusing Family Story playback: $id_name must be a positive integer." >&2
    exit 2
  fi
done

if [[ -z "${STORAGE_BUCKET:-}" || -n "${STORAGE_CDN_URL:-}" ]]; then
  echo "Refusing Family Story playback: API storage bucket must be configured without a public CDN URL." >&2
  exit 2
fi
: "${STORAGE_ENDPOINT:?STORAGE_ENDPOINT is required from the Railway API service}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required from the Railway API service}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required from the Railway API service}"

runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/niakofa-family-story.XXXXXX")"
runtime_dir="$(cd "$runtime_dir" && pwd -P)"
chmod 700 "$runtime_dir"
state_file="$runtime_dir/user-a-state.json"

env -i PATH="$PATH" HOME="${HOME:-/tmp}" TMPDIR="${TMPDIR:-/tmp}" \
  STORAGE_BUCKET="$STORAGE_BUCKET" \
  STORAGE_ENDPOINT="$STORAGE_ENDPOINT" \
  STORAGE_REGION="${STORAGE_REGION:-auto}" \
  AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  CERTIFICATION_S3_URL_STYLE="${CERTIFICATION_S3_URL_STYLE:-virtual}" \
  node "$script_dir/railway-bucket-object.mjs" get "$object_key" "$state_file"

env -i PATH="$PATH" HOME="${HOME:-/tmp}" \
  node "$script_dir/validate-user-a-state.mjs" "$state_file" USER_A_STATE

playwright_env=(
  env -i
  "PATH=$PATH"
  "HOME=${HOME:-/tmp}"
  "PLAYWRIGHT_BASE_URL=$BASE_URL"
  "EXPECTED_COMMIT=$EXPECTED_COMMIT"
  "USER_A_STATE=$state_file"
  "ALLOW_FAMILY_STORY_READONLY_E2E=1"
  "CONFIRM_DISPOSABLE_ACCOUNT=1"
)
if [[ -n "${FAMILY_ID:-}" ]]; then playwright_env+=("FAMILY_ID=$FAMILY_ID"); fi
if [[ -n "${FAMILY_STORY_ID:-}" ]]; then playwright_env+=("FAMILY_STORY_ID=$FAMILY_STORY_ID"); fi
if [[ -x "/repl/tools/bin/chromium" ]]; then
  playwright_env+=("PLAYWRIGHT_EXECUTABLE_PATH=/repl/tools/bin/chromium")
fi

echo "Running read-only private Family Story playback verification with bucket-backed User A state."
"${playwright_env[@]}" ./node_modules/.bin/playwright test "$repository_root/e2e/family-story-bucket-playback.spec.ts" --reporter=line
