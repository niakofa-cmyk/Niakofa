#!/usr/bin/env bash
set -euo pipefail

object_key="test-auth/user-a/niakofa-state.json"
state_file="${1:-}"

unset USER_A_STATE_JSON USER_B_STATE_JSON

: "${CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE:?Set CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE=1 only after confirming the bucket has no public-read policy or CDN route.}"
if [[ "$CONFIRM_RAILWAY_TEST_STATE_BUCKET_PRIVATE" != "1" ]]; then
  echo "Refusing state upload: confirm the Railway bucket is private." >&2
  exit 2
fi
: "${CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE:?Confirm the API service storage variables reference niakofa-production-media.}"
if [[ "$CONFIRM_RAILWAY_MEDIA_BUCKET_REFERENCE" != "1" ]]; then
  echo "Refusing state upload: confirm the API service references the existing media bucket." >&2
  exit 2
fi
if [[ -z "$state_file" ]]; then
  echo "Usage: ops/upload-railway-user-a-state.sh <local-state-file>" >&2
  exit 2
fi
if [[ -z "${STORAGE_BUCKET:-}" ]]; then
  echo "Refusing state upload: the API service's Railway STORAGE_BUCKET reference is required." >&2
  exit 2
fi
if [[ -n "${STORAGE_CDN_URL:-}" ]]; then
  echo "Refusing state upload while STORAGE_CDN_URL is configured." >&2
  exit 2
fi
: "${STORAGE_ENDPOINT:?STORAGE_ENDPOINT is required from the Railway API service}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required from the Railway API service}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required from the Railway API service}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
state_file="$(cd "$(dirname "$state_file")" && pwd -P)/$(basename "$state_file")"
env -i PATH="$PATH" HOME="${HOME:-/tmp}" \
  node "$repository_root/ops/validate-user-a-state.mjs" "$state_file" USER_A_STATE

env -i PATH="$PATH" HOME="${HOME:-/tmp}" \
  STORAGE_BUCKET="$STORAGE_BUCKET" \
  STORAGE_ENDPOINT="$STORAGE_ENDPOINT" \
  STORAGE_REGION="${STORAGE_REGION:-auto}" \
  AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  CERTIFICATION_S3_URL_STYLE="${CERTIFICATION_S3_URL_STYLE:-virtual}" \
  node "$repository_root/ops/railway-bucket-object.mjs" put "$object_key" "$state_file"