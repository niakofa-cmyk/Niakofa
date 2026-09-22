#!/usr/bin/env bash
set -euo pipefail

# Compatibility entry point retained for operator notes that used this name.
# The canonical runner owns all validation and mutation safety checks.
exec "$(dirname "$0")/run-deployed-acceptance.sh" "$@"