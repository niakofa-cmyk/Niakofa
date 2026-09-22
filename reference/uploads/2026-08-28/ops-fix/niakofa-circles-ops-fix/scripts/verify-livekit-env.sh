#!/usr/bin/env bash
# Quick check that LiveKit env is present and URL shape is valid.
# Does not print secrets. Exit 0 = OK, 1 = misconfigured.

set -euo pipefail

ok=1

if [[ -z "${LIVEKIT_URL:-}" ]]; then
  echo "FAIL: LIVEKIT_URL is not set"
  ok=0
else
  case "$LIVEKIT_URL" in
    wss://*) echo "OK: LIVEKIT_URL uses wss://" ;;
    ws://localhost*|ws://127.0.0.1*|ws://[::1]*) echo "OK: LIVEKIT_URL local ws (dev only)" ;;
    *) echo "FAIL: LIVEKIT_URL must be wss://... (or ws://localhost for dev). Got: ${LIVEKIT_URL%%@*}"
       ok=0 ;;
  esac
fi

if [[ -z "${LIVEKIT_API_KEY:-}" ]]; then
  echo "FAIL: LIVEKIT_API_KEY is not set"
  ok=0
else
  echo "OK: LIVEKIT_API_KEY is set (length ${#LIVEKIT_API_KEY})"
fi

if [[ -z "${LIVEKIT_API_SECRET:-}" ]]; then
  echo "FAIL: LIVEKIT_API_SECRET is not set"
  ok=0
else
  echo "OK: LIVEKIT_API_SECRET is set (length ${#LIVEKIT_API_SECRET})"
fi

if [[ "$ok" -eq 1 ]]; then
  echo "LiveKit env looks configured."
  exit 0
fi
echo "LiveKit env is incomplete — media-token will return 503."
exit 1
