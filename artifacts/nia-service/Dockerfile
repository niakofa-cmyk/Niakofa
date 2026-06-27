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

# Copy source. A single directory-level COPY (rather than separate per-file
# COPY instructions for tsconfig.json / src/ / migrate.sql) avoids a BuildKit
# cache lookup failure seen on Railway where a newly-introduced, never-before-
# cached per-file COPY path inside a monorepo subdirectory intermittently
# fails with "not found" even though the file is committed and present in the
# build context. Copying the whole directory in one layer sidesteps that lazy
# per-path resolution entirely. migrate.sql (used by src/lib/db.ts
# runMigrations() for first-time schema setup) is included automatically.
#
# CACHE_BUST is a real build arg (not just a comment) so it changes this
# layer's instruction text and forces BuildKit to recompute its cache key
# instead of reusing a stale/orphaned ref from a prior build — this is what
# was producing "failed to calculate checksum of ref ...: not found" even
# though the directory is present and unchanged in the build context. Bump
# the default value any time this layer needs to be force-rebuilt again.
ARG CACHE_BUST=2026-06-26b
COPY artifacts/nia-service/ ./artifacts/nia-service/

RUN pnpm --filter nia-service build

# Prune dev-only packages for a leaner runtime image
RUN pnpm --filter nia-service deploy --prod /app/deploy

WORKDIR /app/deploy

# Expose default port for documentation; actual port injected via PORT env var at runtime
EXPOSE 3001
CMD ["node", "dist/index.js"]
# cache-bust: 1782572320
