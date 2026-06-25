# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app

# Copy manifests first so layer is cached unless deps change
COPY package.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
# migrate.sql is referenced by src/lib/db.ts runMigrations() for first-time
# schema setup when DATABASE_URL points to a fresh Postgres instance.
COPY migrate.sql ./migrate.sql
RUN npm run build

# Prune dev-only packages for a leaner runtime image
RUN npm prune --omit=dev

# Expose default port for documentation; actual port injected via PORT env var at runtime
EXPOSE 3001
CMD ["node", "dist/index.js"]
