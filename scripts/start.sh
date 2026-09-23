#!/bin/bash
set -euo pipefail

# ── Niakofa Railway Start Script ──────────────────────────────────────────────
# Railway is the production runtime for this script. Keep an explicitly supplied
# NODE_ENV for trusted local diagnostics, but default to production so deploy
# safety gates cannot be bypassed by an omitted platform variable.
export NODE_ENV="${NODE_ENV:-production}"

# 1. Runs database migrations (blocks deploy on failure).
# 2. Starts nia-service on port 3001 with a bounded-backoff restart supervisor.
# 3. Starts api-server in the foreground (primary process).
# 4. SIGTERM/SIGINT cleanly kills both child processes.
#
# Nia is an optional dependency of the public API. A transient Nia crash must
# not take down api-server, but the supervisor must keep trying so /health can
# recover without requiring a full Railway redeploy.

echo "[start] NODE_ENV=${NODE_ENV}"

NIA_PID_FILE="$(mktemp /tmp/nia-service-pid.XXXXXX)"
trap 'rm -f "$NIA_PID_FILE"' EXIT

# ── Migrations ────────────────────────────────────────────────────────────────
MIGRATE_MAX_RETRIES=3
MIGRATE_ATTEMPT=0
MIGRATE_OK=false
while [ "$MIGRATE_ATTEMPT" -lt "$MIGRATE_MAX_RETRIES" ]; do
  MIGRATE_ATTEMPT=$((MIGRATE_ATTEMPT + 1))
  echo "[start] running database migrations (attempt $MIGRATE_ATTEMPT/$MIGRATE_MAX_RETRIES)..."
  if pnpm --filter @workspace/db run migrate; then
    echo "[start] migrations complete"
    MIGRATE_OK=true
    break
  fi
  echo "[start] migration attempt $MIGRATE_ATTEMPT failed — retrying in 3s..."
  sleep 3
done

if [ "$MIGRATE_OK" = "false" ]; then
  echo "[start] ERROR: all migration attempts failed — refusing to start services"
  exit 1
fi

# ── Signal handler — forward SIGTERM/SIGINT to current nia-service PID ────────
cleanup() {
  echo "[start] shutdown signal received — cleaning up"
  local nia_pid
  nia_pid="$(cat "$NIA_PID_FILE" 2>/dev/null || true)"
  if [ -n "$nia_pid" ]; then
    kill -TERM "$nia_pid" 2>/dev/null || true
    wait "$nia_pid" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup TERM INT

# ── Supervisor loop (background subshell) ─────────────────────────────────────
# Nia must stay recoverable for the lifetime of the api-server process. The
# previous supervisor stopped after five crashes, permanently turning Nia into
# a 503 until the whole Railway container was redeployed. We instead use capped
# exponential backoff and continue supervising indefinitely.
(
  NIA_RESTART_COUNT=0
  NIA_BACKOFF_SECONDS=2
  NIA_BACKOFF_RESET_AFTER_SECONDS=300

  while true; do
    # Spawn nia-service as a direct child of THIS subshell so wait() captures
    # the real exit status and restart decisions are reliable.
    NIA_STARTED_AT="$(date +%s)"
    PORT=3001 node --enable-source-maps artifacts/nia-service/dist/index.js &
    NIA_PID=$!
    echo "$NIA_PID" > "$NIA_PID_FILE"
    echo "[supervisor] nia-service started (pid $NIA_PID)"

    set +e
    wait "$NIA_PID" 2>/dev/null
    EXIT_CODE=$?
    set -e

    # 0 = clean exit, 143 = SIGTERM — don't restart during shutdown.
    if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 143 ]; then
      echo "[supervisor] nia-service exited cleanly (rc=$EXIT_CODE)"
      break
    fi

    NIA_RESTART_COUNT=$((NIA_RESTART_COUNT + 1))
    NIA_RUNTIME_SECONDS=$(( $(date +%s) - NIA_STARTED_AT ))

    # A sustained run means the earlier crash storm has recovered. Reset both
    # the retry counter and backoff so a later isolated crash recovers quickly.
    if [ "$NIA_RUNTIME_SECONDS" -ge "$NIA_BACKOFF_RESET_AFTER_SECONDS" ]; then
      NIA_RESTART_COUNT=1
      NIA_BACKOFF_SECONDS=2
      echo "[supervisor] nia-service recovered for ${NIA_RUNTIME_SECONDS}s — resetting restart backoff"
    fi

    echo "[supervisor] nia-service crashed (rc=$EXIT_CODE) — restart #$NIA_RESTART_COUNT in ${NIA_BACKOFF_SECONDS}s"
    sleep "$NIA_BACKOFF_SECONDS"
    NIA_BACKOFF_SECONDS=$((NIA_BACKOFF_SECONDS * 2))
    if [ "$NIA_BACKOFF_SECONDS" -gt 60 ]; then
      NIA_BACKOFF_SECONDS=60
    fi
  done
) &
SUPERVISOR_PID=$!

# ── api-server (foreground — blocks until exit) ───────────────────────────────
echo "[start] starting api-server..."
node --enable-source-maps artifacts/api-server/dist/index.mjs
API_EXIT=$?

# api-server exited — tear down supervisor and nia-service
kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
wait "$SUPERVISOR_PID" 2>/dev/null || true
nia_pid="$(cat "$NIA_PID_FILE" 2>/dev/null || true)"
if [ -n "$nia_pid" ]; then
  kill -TERM "$nia_pid" 2>/dev/null || true
  wait "$nia_pid" 2>/dev/null || true
fi
exit "$API_EXIT"
