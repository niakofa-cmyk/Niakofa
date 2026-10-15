#!/usr/bin/env bash
set -euo pipefail

# Called under start-local-postgres.sh's setup lock. Never use workspace or
# production Redis connection settings for the disposable development stack.
port="${NIAKOFA_LOCAL_REDIS_PORT:-56379}"
directory="${NIAKOFA_LOCAL_REDIS_DIR:-/tmp/niakofa-redis}"
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
  echo "[local-redis] ERROR: an unprivileged TCP port is required" >&2
  exit 1
fi
if ! command -v redis-server >/dev/null || ! command -v redis-cli >/dev/null; then
  echo "[local-redis] ERROR: redis-server and redis-cli are required for local media processing" >&2
  exit 1
fi
ping_local() {
  env -u REDISCLI_AUTH redis-cli -h 127.0.0.1 -p "$port" ping 2>/dev/null
}
if [[ "$(ping_local || true)" != "PONG" ]]; then
  mkdir -p "$directory"
  chmod 700 "$directory"
  redis-server --bind 127.0.0.1 --protected-mode yes --port "$port" \
    --dir "$directory" --daemonize yes --appendonly yes --save "" \
    --pidfile "$directory/redis.pid" --logfile "$directory/redis.log"
fi
for _ in {1..30}; do
  if [[ "$(ping_local || true)" == "PONG" ]]; then
    echo "[local-redis] ready: host=127.0.0.1 port=$port" >&2
    printf 'redis://127.0.0.1:%s\n' "$port"
    exit 0
  fi
  sleep 0.1
done
echo "[local-redis] ERROR: local Redis did not become ready" >&2
exit 1
