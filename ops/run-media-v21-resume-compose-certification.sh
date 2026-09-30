#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "${1:-}" == "--list" ]]; then
  if [[ "$#" -ne 1 ]]; then
    echo "Usage: $0 [--list]" >&2
    exit 2
  fi
  env -u USER_A_STATE -u USER_B_STATE \
    PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 \
    corepack pnpm exec playwright test e2e/media-v21-resume-compose.spec.ts --list
  exit $?
fi
if [[ "$#" -ne 0 ]]; then
  echo "Usage: $0 [--list]" >&2
  exit 2
fi

for gate in \
  ALLOW_MEDIA_PRODUCTION_E2E \
  CONFIRM_DISPOSABLE_ACCOUNT \
  CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE \
  MEDIA_PLATFORM_V21_BROWSER_SMOKE
do
  if [[ "${!gate:-}" != "1" ]]; then
    echo "Refusing V21 resume/compose certification: set ${gate}=1 explicitly after deliberate operator approval." >&2
    exit 2
  fi
done

: "${BASE_URL:?BASE_URL is required}"
: "${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
: "${USER_A_STATE:?USER_A_STATE must name the approved disposable owner state file}"
: "${USER_B_STATE:?USER_B_STATE must name the distinct approved isolation state file}"

if [[ -n "${USER_A_STATE_JSON:-}" || -n "${USER_B_STATE_JSON:-}" ]]; then
  echo "Refusing V21 resume/compose certification: supply approved 0600 state files, not state JSON environment variables." >&2
  exit 2
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Refusing V21 resume/compose certification: EXPECTED_COMMIT must be a full 40-character Git commit SHA." >&2
  exit 2
fi

node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const base = process.env.BASE_URL;
let url;
try {
  url = new URL(base);
} catch {
  throw new Error("BASE_URL must be a credential-free HTTPS origin.");
}
if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
  throw new Error("BASE_URL must be a credential-free HTTPS origin without path, query, or fragment.");
}

for (const variable of ["USER_A_STATE", "USER_B_STATE"]) {
  const resolved = path.resolve(process.env[variable]);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${variable} must be outside the repository.`);
  }
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600 ||
      fs.realpathSync(resolved) !== resolved) {
    throw new Error(`${variable} must be a regular, non-symlink file with exact 0600 permissions.`);
  }
}
NODE

node ops/validate-user-a-state.mjs "$USER_A_STATE" USER_A_STATE
node ops/validate-user-a-state.mjs "$USER_B_STATE" USER_B_STATE

runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/niakofa-media-v21-resume-compose.XXXXXX")"
cleanup() {
  rm -rf -- "$runtime_dir"
}
trap cleanup EXIT
chmod 700 "$runtime_dir"
runtime_realpath="$(cd "$runtime_dir" && pwd -P)"
case "$runtime_realpath" in
  "$repo_root"|"$repo_root"/*)
    echo "Refusing V21 resume/compose certification: temporary runtime directory must be outside the repository." >&2
    exit 2
    ;;
esac
cp -- "$USER_A_STATE" "$runtime_dir/user-a-state.json"
cp -- "$USER_B_STATE" "$runtime_dir/user-b-state.json"
chmod 600 "$runtime_dir/user-a-state.json" "$runtime_dir/user-b-state.json"
export USER_A_STATE="$runtime_dir/user-a-state.json"
export USER_B_STATE="$runtime_dir/user-b-state.json"
mkdir -m 700 "$runtime_dir/playwright-output"

export PLAYWRIGHT_BASE_URL="$BASE_URL"
export PLAYWRIGHT_OUTPUT_DIR="$runtime_dir/playwright-output"
export TMPDIR="$runtime_dir"
unset MEDIA_SMOKE_CONTEXT_KIND MEDIA_SMOKE_CONTEXT_ID
if [[ -z "${PLAYWRIGHT_EXECUTABLE_PATH:-}" && -x "/repl/tools/bin/chromium" ]]; then
  export PLAYWRIGHT_EXECUTABLE_PATH="/repl/tools/bin/chromium"
fi

echo "Running gated V21 resumable-upload and camera-clip-composition certification for commit $EXPECTED_COMMIT."
corepack pnpm exec playwright test e2e/media-v21-resume-compose.spec.ts \
  --reporter=line \
  --output "$runtime_dir/playwright-output"