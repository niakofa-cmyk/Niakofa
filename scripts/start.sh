#!/bin/bash
set -euo pipefail

# ── Niakofa Railway Start Script ──────────────────────────────────────────────
# Runs database migrations, then starts nia-service and api-server together.
#
# nia-service is supervised with a bounded restart loop: up to 5 restarts
# within a 60s window before giving up. This prevents infinite crash loops
# from masking real failures while still surviving transient blips.
# A SIGTERM/SIGINT to this script cleanly kills both child processes.

# ── Migrations ────────────────────────────────────────────────────────────────
echo "[start] running database migrations..."
pnpm --filter @workspace/db run migrate
echo "[start] migrations complete"

# ── nia-service (supervised) ──────────────────────────────────────────────────
NIA_RESTART_MAX=5
NIA_RESTART_WINDOW=60
NIA_RESTART_COUNT=0
NIA_PID=""

start_nia_service() {
  PORT=3001 node --enable-source-maps artifacts/nia-service/dist/index.js &
  NIA_PID=$!
  echo "[start] nia-service started (pid $NIA_PID)"
}

start_nia_service

# ── Signal handling — forward SIGTERM/SIGINT to children ──────────────────────
cleanup() {
  echo "[start] shutdown signal received — cleaning up"
  if [ -n "$NIA_PID" ]; then
    kill -TERM "$NIA_PID" 2>/dev/null || true
    wait "$NIA_PID" 2>/dev/null || true
  fi
  # api-server is the foreground process — it receives the signal directly
  exit 0
}
trap cleanup TERM INT

# ── Start api-server (foreground) ─────────────────────────────────────────────
# The api-server is the primary process. When it exits, the container exits.
# We run nia-service supervision in a background subshell.
(
  while true; do
    wait "$NIA_PID" 2>/dev/null
    EXIT_CODE=$?
    # Exit code 0 or 143 (SIGTERM) = clean shutdown, don't restart
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
    start_nia_service
  done
) &
SUPERVISOR_PID=$!

# ── api-server (foreground, blocks) ──────────────────────────────────────────
echo "[start] starting api-server..."
node --enable-source-maps artifacts/api-server/dist/index.mjs
API_EXIT=$?

# Clean up background processes
kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
if [ -n "$NIA_PID" ]; then
  kill -TERM "$NIA_PID" 2>/dev/null || true
fi
exit "$API_EXIT"
