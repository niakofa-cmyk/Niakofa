#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_ROOT="$(mktemp -d /tmp/niakofa-moments-browser-e2e.XXXXXX)"
chmod 700 "$TEMP_ROOT"

pick_loopback_port() {
  for _ in {1..40}; do
    local port
    port="$(shuf -i 20000-59000 -n 1)"
    if ! (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
      printf '%s\n' "$port"
      return 0
    fi
  done
  echo "Could not reserve a loopback port for the disposable test stack." >&2
  return 1
}

PG_PORT="$(pick_loopback_port)"
REDIS_PORT="$(pick_loopback_port)"
while [[ "$REDIS_PORT" == "$PG_PORT" ]]; do
  REDIS_PORT="$(pick_loopback_port)"
done
export NIAKOFA_LOCAL_PGDATA="$TEMP_ROOT/postgres"
export NIAKOFA_LOCAL_PGSOCKET="$TEMP_ROOT/postgres-socket"
export NIAKOFA_LOCAL_PGLOG="$TEMP_ROOT/postgres.log"
export NIAKOFA_LOCAL_PGPORT="$PG_PORT"
export NIAKOFA_LOCAL_PGDATABASE="niakofa_moments_test_$$"
export NIAKOFA_LOCAL_REDIS_DIR="$TEMP_ROOT/redis"
export NIAKOFA_LOCAL_REDIS_PORT="$REDIS_PORT"
export MEDIA_TEST_UPLOADS_DIR="$TEMP_ROOT/uploads"
export MEDIA_PLATFORM_V21=1
export NODE_ENV=test
# This key exists only in this local disposable process. It is never used for
# preview/deployment configuration and is required to exercise signed grants.
export SESSION_SECRET="local-moments-e2e-only-${TEMP_ROOT##*.}-0123456789abcdef0123456789abcdef"

cleanup() {
  local pg_bin
  pg_bin="$(dirname "$(command -v pg_ctl)")"
  if [[ -d "$NIAKOFA_LOCAL_PGDATA" ]]; then
    "$pg_bin/pg_ctl" --pgdata="$NIAKOFA_LOCAL_PGDATA" --mode=fast --wait stop >/dev/null 2>&1 || true
  fi
  redis-cli -h 127.0.0.1 -p "$NIAKOFA_LOCAL_REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
  rm -rf -- "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$MEDIA_TEST_UPLOADS_DIR"
chmod 700 "$MEDIA_TEST_UPLOADS_DIR"

cd "$ROOT"
bash scripts/start-local-postgres.sh bash -lc '
  set -e
  export FAMILY_STORY_RUNTIME_TEST_DATABASE_URL="$DATABASE_URL"
  node lib/db/scripts/run-migrations.mjs
  cd artifacts/api-server
  COMMUNITY_MEDIA_API_RUNTIME_TEST=1 \
  COMMUNITY_MEDIA_BROWSER_ACCEPTANCE=1 \
  node --experimental-vm-modules node_modules/jest/bin/jest.js \
    --config ./jest.config.mjs --runInBand \
    src/__tests__/community-media-api-runtime.integration.test.ts
'
