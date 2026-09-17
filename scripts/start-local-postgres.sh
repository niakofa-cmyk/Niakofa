#!/usr/bin/env bash
set -euo pipefail

# Start or reuse a disposable PostgreSQL cluster for local development, then
# execute the supplied command with an explicit localhost DATABASE_URL.
#
# This helper intentionally overrides the workspace's runtime-managed database
# environment only in its child process. It never changes Replit secrets or
# production configuration.

PG_BIN_DIR="${PG_BIN_DIR:-$(dirname "$(command -v pg_ctl)")}"
PGDATA="${NIAKOFA_LOCAL_PGDATA:-/tmp/niakofa-postgres}"
PGSOCKET="${NIAKOFA_LOCAL_PGSOCKET:-/tmp/niakofa-postgres-socket}"
PGPORT="${NIAKOFA_LOCAL_PGPORT:-55432}"
PGDATABASE="${NIAKOFA_LOCAL_PGDATABASE:-niakofa_dev}"
PGUSER="${NIAKOFA_LOCAL_PGUSER:-$(id -un)}"
PGLOG="${NIAKOFA_LOCAL_PGLOG:-/tmp/niakofa-postgres.log}"
PG_SETUP_LOCK="${PGDATA}.setup.lock"

if [[ ! "$PGPORT" =~ ^[0-9]+$ ]] || (( PGPORT < 1024 || PGPORT > 65535 )); then
  echo "[local-pg] ERROR: NIAKOFA_LOCAL_PGPORT must be an unprivileged TCP port" >&2
  exit 1
fi

if [[ ! "$PGDATABASE" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || [[ ! "$PGUSER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "[local-pg] ERROR: local database and user names must be simple SQL identifiers" >&2
  exit 1
fi

if [[ ! -x "$PG_BIN_DIR/pg_ctl" || ! -x "$PG_BIN_DIR/initdb" || ! -x "$PG_BIN_DIR/psql" ]]; then
  echo "[local-pg] ERROR: PostgreSQL 16 tools (pg_ctl, initdb, psql) are required" >&2
  exit 1
fi

mkdir -p "$PGSOCKET"
chmod 700 "$PGSOCKET"

# API and Nia start together and may arrive here at the same time. Serialize
# initialization, server startup, and database creation so two initdb processes
# cannot corrupt the disposable cluster.
while ! mkdir "$PG_SETUP_LOCK" 2>/dev/null; do
  sleep 0.1
done
trap 'rmdir "$PG_SETUP_LOCK" 2>/dev/null || true' EXIT

if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
  if [[ -e "$PGDATA" && -n "$(find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    # An interrupted initdb can leave a partial cluster behind. This path is
    # disposable by design; recover only the default /tmp cluster, and keep
    # custom paths fail-closed instead of deleting operator-owned data.
    if [[ "$PGDATA" == "/tmp/niakofa-postgres" && -d "$PGDATA/pg_wal" ]]; then
      echo "[local-pg] removing incomplete disposable cluster at $PGDATA"
      find "$PGDATA" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    else
      echo "[local-pg] ERROR: $PGDATA exists but is not a PostgreSQL data directory" >&2
      exit 1
    fi
  fi
  mkdir -p "$PGDATA"
  chmod 700 "$PGDATA"
  echo "[local-pg] initializing development cluster at $PGDATA"
  "$PG_BIN_DIR/initdb" \
    --pgdata="$PGDATA" \
    --username="$PGUSER" \
    --auth-local=trust \
    --auth-host=trust \
    --no-locale \
    --encoding=UTF8 >/dev/null
fi

if ! "$PG_BIN_DIR/pg_ctl" \
  --pgdata="$PGDATA" \
  --options="-p $PGPORT -k $PGSOCKET -c listen_addresses=127.0.0.1" \
  --log="$PGLOG" \
  status >/dev/null 2>&1; then
  echo "[local-pg] starting development PostgreSQL on 127.0.0.1:$PGPORT"
  "$PG_BIN_DIR/pg_ctl" \
    --pgdata="$PGDATA" \
    --options="-p $PGPORT -k $PGSOCKET -c listen_addresses=127.0.0.1" \
    --log="$PGLOG" \
    --wait start >/dev/null
fi

LOCAL_PSQL_ENV=(
  env
  -u DATABASE_URL
  -u DATABASE_SSL
  -u PGHOST
  -u PGPORT
  -u PGDATABASE
  -u PGUSER
  -u PGPASSWORD
  -u REDIS_URL
  -u REDIS_URLS
  PGHOST="$PGSOCKET"
  PGPORT="$PGPORT"
  PGUSER="$PGUSER"
)

if ! "${LOCAL_PSQL_ENV[@]}" "$PG_BIN_DIR/psql" \
  --dbname=postgres \
  --tuples-only \
  --no-align \
  --command="SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" | grep -qx "1"; then
  echo "[local-pg] creating development database $PGDATABASE"
  "${LOCAL_PSQL_ENV[@]}" "$PG_BIN_DIR/createdb" "$PGDATABASE"
fi

if [[ "$#" -eq 0 ]]; then
  echo "[local-pg] ready: database=$PGDATABASE host=127.0.0.1 port=$PGPORT"
  exit 0
fi

export DATABASE_URL="postgresql://${PGUSER}@127.0.0.1:${PGPORT}/${PGDATABASE}"
export DATABASE_SSL=disable
export PGHOST="$PGSOCKET"
export PGPORT="$PGPORT"
export PGDATABASE="$PGDATABASE"
export PGUSER="$PGUSER"
export NIA_SERVICE_URL="${NIAKOFA_LOCAL_NIA_URL:-http://127.0.0.1:3001}"
unset PGPASSWORD REDIS_URL REDIS_URLS

trap - EXIT
rmdir "$PG_SETUP_LOCK" 2>/dev/null || true

echo "[local-pg] ready: database=$PGDATABASE host=127.0.0.1 port=$PGPORT"
exec "$@"