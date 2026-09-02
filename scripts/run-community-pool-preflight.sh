#!/usr/bin/env bash
set -euo pipefail

# Read-only production preflight. This script never applies migrations.
# Required: DATABASE_URL. Optional: PSQL_BIN (defaults to psql).
: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL_BIN="${PSQL_BIN:-psql}"

"$PSQL_BIN" "$DATABASE_URL" \
  -X \
  -v ON_ERROR_STOP=1 \
  -f scripts/verify-community-pool-financial-integrity.sql

echo "Community Pool financial-integrity preflight completed."
echo "Review every result set: only migration/status checks may contain rows."
