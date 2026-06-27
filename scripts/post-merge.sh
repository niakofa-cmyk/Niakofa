#!/bin/bash
set -e
pnpm install --frozen-lockfile
# SAFETY: use drizzle-kit migrate (not push) to avoid silent destructive changes
pnpm --filter db run migrate
