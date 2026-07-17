#!/bin/bash
set -e

# Build TypeScript declaration files for shared libs that other packages
# reference as composite projects (tsc --build requires their dist/ to exist
# before it can type-check the packages that import them).
pnpm --filter @workspace/api-client-react run build
pnpm --filter @workspace/api-zod run build 2>/dev/null || true

pnpm install --frozen-lockfile

# SAFETY: use drizzle-kit migrate (not push) to avoid silent destructive changes
pnpm --filter db run migrate

# Seed civic resources and Fort Worth data if the DB is fresh (idempotent — no-op if rows exist).
# This runs on every merge so Railway/Replit dev envs always have real data on first boot.
pnpm --filter @workspace/scripts run seed-if-empty || echo "[post-merge] seed-if-empty skipped (non-fatal)"
