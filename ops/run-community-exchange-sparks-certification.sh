#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
: "${USER_A_STATE:?USER_A_STATE is required for the disposable listing owner}"
: "${USER_B_STATE:?USER_B_STATE is required for the isolated disposable viewer}"
: "${SPARK_SMOKE_LISTING_ID:?SPARK_SMOKE_LISTING_ID is required}"
: "${SPARK_SMOKE_RUN_ID:?SPARK_SMOKE_RUN_ID is required and must be unique per acceptance attempt}"
: "${SPARK_SMOKE_RECOVERY_DIR:?SPARK_SMOKE_RECOVERY_DIR is required outside the checkout}"

if [[ "${ALLOW_COMMUNITY_EXCHANGE_SPARKS_E2E:-}" != "1" ||
      "${CONFIRM_DISPOSABLE_ACCOUNT:-}" != "1" ||
      "${CONFIRM_COMMUNITY_EXCHANGE_SPARKS_PRODUCTION_GATE:-}" != "1" ||
      "${CONFIRM_DISPOSABLE_SPARK_LISTING:-}" != "1" ||
      "${CONFIRM_SPARK_VIEWER_OUTSIDE_OWNER_COMMUNITY:-}" != "1" ]]; then
  echo "Refusing Community/Exchange Sparks E2E: require explicit production-gate, disposable-account, approved-listing, and isolated-viewer confirmations." >&2
  exit 2
fi

if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Refusing Community/Exchange Sparks E2E: EXPECTED_COMMIT must be the full 40-character deployed commit." >&2
  exit 2
fi
if [[ ! "$SPARK_SMOKE_LISTING_ID" =~ ^[1-9][0-9]*$ ]]; then
  echo "Refusing Community/Exchange Sparks E2E: SPARK_SMOKE_LISTING_ID must be a positive approved disposable listing id." >&2
  exit 2
fi
if [[ ! "$SPARK_SMOKE_RUN_ID" =~ ^[A-Za-z0-9_-]{8,64}$ ]]; then
  echo "Refusing Community/Exchange Sparks E2E: SPARK_SMOKE_RUN_ID must be 8-64 letters, digits, underscores, or hyphens." >&2
  exit 2
fi
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
recovery_directory="$(node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  try {
    const input = path.resolve(process.argv[1]);
    const info = fs.lstatSync(input);
    if (info.isSymbolicLink() || !info.isDirectory() ||
        (info.mode & 0o700) !== 0o700 || (info.mode & 0o077) !== 0) process.exit(1);
    const real = fs.realpathSync(input);
    if (real !== input) process.exit(1);
    const relative = path.relative(process.argv[2], real);
    if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) process.exit(1);
    process.stdout.write(real);
  } catch {
    process.exit(1);
  }
' "$SPARK_SMOKE_RECOVERY_DIR" "$repository_root")" || {
  echo "Refusing Community/Exchange Sparks E2E: recovery directory must be a writable, private (mode 0700), non-symlink directory outside the checkout." >&2
  exit 2
}
export SPARK_SMOKE_RECOVERY_DIR="$recovery_directory"

if ! node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  const directory = process.argv[1];
  const prefix = "community-exchange-sparks-";
  const files = fs.readdirSync(directory).filter((name) => name.startsWith(prefix));
  for (const name of files) {
    if (!name.endsWith(".json")) {
      console.error("A recovery temporary file remains; inspect the private recovery directory.");
      process.exit(1);
    }
    const file = path.join(directory, name);
    const info = fs.lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o777) !== 0o600 || fs.realpathSync(file) !== file) {
      console.error("Recovery records must be regular private 0600 files.");
      process.exit(1);
    }
    let record;
    try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch {
      console.error("A recovery record is unreadable or malformed.");
      process.exit(1);
    }
    const runId = name.slice(prefix.length, -".json".length);
    const idLists = [record?.spark_ids, record?.media_asset_ids,
      record?.reconciled_spark_ids, record?.reconciled_media_asset_ids];
    if (!idLists.every(Array.isArray)) {
      console.error("A recovery record has invalid resource-ID lists.");
      process.exit(1);
    }
    const ids = idLists.flat();
    let validOrigin = false;
    try {
      const origin = new URL(record?.target_origin);
      validOrigin = origin.protocol === "https:" && origin.origin === record.target_origin &&
        !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash;
    } catch {
      validOrigin = false;
    }
    if (record?.version !== 1 || record.run_id !== runId || !/^[A-Za-z0-9_-]{8,64}$/.test(runId) ||
        !Number.isSafeInteger(record.owner_user_id) || record.owner_user_id < 1 ||
        !Number.isSafeInteger(record.listing_id) || record.listing_id < 1 || !validOrigin ||
        !Array.isArray(record.spark_ids) || !Array.isArray(record.media_asset_ids) ||
        !Array.isArray(record.reconciled_spark_ids) || !Array.isArray(record.reconciled_media_asset_ids) ||
        ids.some((id) => !Number.isSafeInteger(id) || id < 1) ||
        record.manual_reconciliation_confirmed !== true) {
      console.error("Unresolved recovery records remain; do not start another mutating run.");
      process.exit(1);
    }
  }
  if (files.length && process.env.CONFIRM_SPARK_RECOVERY_RECONCILED !== "1") {
    console.error("Existing records require explicit CONFIRM_SPARK_RECOVERY_RECONCILED=1 after exact-ID server-side verification.");
    process.exit(1);
  }
' "$recovery_directory"; then
  echo "Refusing Community/Exchange Sparks E2E: unresolved or unconfirmed recovery records exist." >&2
  exit 2
fi
if ! node --input-type=module -e '
  try {
    const target = new URL(process.argv[1]);
    if (target.protocol !== "https:" || !target.hostname || target.username || target.password ||
        target.pathname !== "/" || target.search || target.hash) process.exit(1);
  } catch {
    process.exit(1);
  }
' "$BASE_URL"; then
  echo "Refusing Community/Exchange Sparks E2E: BASE_URL must be a credential-free HTTPS origin." >&2
  exit 2
fi

node ops/validate-user-a-state.mjs "$USER_A_STATE" USER_A_STATE
node ops/validate-user-a-state.mjs "$USER_B_STATE" USER_B_STATE

export PLAYWRIGHT_BASE_URL="$BASE_URL"
if [[ -z "${PLAYWRIGHT_EXECUTABLE_PATH:-}" && -x "/repl/tools/bin/chromium" ]]; then
  export PLAYWRIGHT_EXECUTABLE_PATH="/repl/tools/bin/chromium"
fi

echo "Running guarded Community/Exchange Sparks acceptance. Recovery procedure: public draft/feed APIs can omit pending-moderation and expired/ineligible records. For each private record, inspect exchange_sparks by each spark_id and verify author_user_id/listing_id/status; inspect media_assets by each media_asset_id and verify owner_user_id/context_kind=exchange_spark/context_id/status/original_key/variant_key/thumbnail_key/metadata.storage_cleanup_pending. Through approved server-side storage tools, verify each exact recorded object key is absent. If a row/object remains, use only the approved exact-ID or exact-key cleanup path; never broad-delete by caption or feed results. Preserve run/owner/listing/IDs, then set manual_reconciliation_confirmed=true and CONFIRM_SPARK_RECOVERY_RECONCILED=1 only after independent verification. Empty feed results are not proof of cleanup. Failed-asset retry is conditional on natural failure."
corepack pnpm exec playwright test e2e/community-exchange-sparks-authenticated.spec.ts --reporter=line