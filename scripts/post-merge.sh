#!/bin/bash
set -e

# 1. Install dependencies first — esbuild postinstall wires the linux-x64 binary;
#    all subsequent build commands require node_modules to exist.
pnpm install --frozen-lockfile

# 2. Build TypeScript declaration files for shared libs.
#    lib/api-client-react and lib/api-zod are composite tsc --build projects.
#    Their dist/ must exist before any importer runs tsc --noEmit or the
#    bundler resolves @workspace/api-client-react.
pnpm --filter "@workspace/api-zod" run build
pnpm --filter "@workspace/api-client-react" run build

# 3. Apply any pending DB migrations (drizzle-kit migrate — never push).
#    Safe to run on every merge; idempotent if no new migrations exist.
pnpm --filter "@workspace/db" run migrate

# 4. Seed civic resources and base data.
#    The seed is idempotent and repairs partial imports, so failures must stop
#    post-merge setup instead of leaving a silently incomplete database.
pnpm --filter "@workspace/scripts" run seed-if-empty
