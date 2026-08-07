#!/bin/bash
set -euo pipefail

# ── Niakofa Railway Start Script ──────────────────────────────────────────────
# 1. Runs database migrations (blocks deploy on failure).
# 2. Starts nia-service on port 3001 with a bounded restart supervisor.
#    The supervisor IS the process that spawns nia-service so that `wait`
#    operates on a direct child — avoids the bash cross-subshell wait bug
#    where wait on a non-child PID returns 127 immediately, causing the
#    supervisor to mis-classify every startup as a crash and spin-restart.
# 3. Starts api-server in the foreground (primary process).
# 4. SIGTERM/SIGINT cleanly kills both child processes.
#
# PID sharing: nia-service PID is written to a temp file on every (re)start
# so the SIGTERM trap always kills the CURRENT process, not a stale one.

NIA_PID_FILE="$(mktemp /tmp/nia-service-pid.XXXXXX)"
trap 'rm -f "$NIA_PID_FILE"' EXIT

# ── Migrations ────────────────────────────────────────────────────────────────
echo "[start] running database migrations..."
pnpm --filter @workspace/db run migrate
echo "[start] migrations complete"

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
# IMPORTANT: nia-service is spawned INSIDE this subshell so that `wait` on
# its PID is valid (bash wait only works reliably on direct children).
# The prior design spawned nia-service in the parent and tried to wait in
# the subshell — bash returned 127 immediately, triggering constant false
# crash-restart loops under Railway.
NIA_RESTART_MAX=5

(
  NIA_RESTART_COUNT=0

  while true; do
    # Spawn nia-service as a child of THIS subshell
    PORT=3001 node --enable-source-maps artifacts/nia-service/dist/index.js &
    NIA_PID=$!
    echo "$NIA_PID" > "$NIA_PID_FILE"
    echo "[supervisor] nia-service started (pid $NIA_PID)"

    # wait is valid here — NIA_PID is a direct child of this subshell
    wait "$NIA_PID" 2>/dev/null || true
    EXIT_CODE=$?

    # 0 = clean exit, 143 = SIGTERM — don't restart
    if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 143 ]; then
      echo "[supervisor] nia-service exited cleanly (rc=$EXIT_CODE)"
      break
    fi

    NIA_RESTART_COUNT=$((NIA_RESTART_COUNT + 1))
    if [ "$NIA_RESTART_COUNT" -ge "$NIA_RESTART_MAX" ]; then
      echo "[supervisor] nia-service crashed $NIA_RESTART_MAX times — giving up (rc=$EXIT_CODE)"
      break
    fi

    echo "[supervisor] nia-service crashed (rc=$EXIT_CODE) — restart $NIA_RESTART_COUNT/$NIA_RESTART_MAX in 5s"
    sleep 5
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
