# syntax=docker/dockerfile:1
FROM node:22-alpine

# Pin pnpm to the exact version used by the rest of the monorepo so transitive
# dependency resolution is identical to what every other workspace package sees.
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy workspace manifests first — Docker layer cache is invalidated only when
# these files change, keeping the expensive pnpm install step fast.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/nia-service/package.json ./artifacts/nia-service/package.json

# Install only this service's deps, pinned to the root lockfile.
# --frozen-lockfile ensures the lock file governs every transitive version,
# matching the guarantee every other monorepo package has.
RUN pnpm install --frozen-lockfile --filter nia-service

# Copy source
COPY artifacts/nia-service/tsconfig.json ./artifacts/nia-service/
COPY artifacts/nia-service/src/ ./artifacts/nia-service/src/
# migrate.sql is referenced by src/lib/db.ts runMigrations() for first-time
# schema setup when DATABASE_URL points to a fresh Postgres instance.
COPY artifacts/nia-service/migrate.sql ./artifacts/nia-service/migrate.sql

RUN pnpm --filter nia-service build

# Prune dev-only packages for a leaner runtime image
RUN pnpm --filter nia-service deploy --prod /app/deploy

WORKDIR /app/deploy

# Expose default port for documentation; actual port injected via PORT env var at runtime
EXPOSE 3001
CMD ["node", "dist/index.js"]
# cache bust Thu Jun 25 06:06:25 CDT 2026
