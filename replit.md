# Niakofa project instructions

The canonical project reference, architecture
decisions, workflow commands, operating rules, and changelog are maintained in:

**→ [`artifacts/nia-service/REPLIT_GODFATHER.md`](artifacts/nia-service/REPLIT_GODFATHER.md)**

Read that document before changing the repository. Keep collaborator-specific
instructions and durable implementation lessons in their designated files:
`CLAUDE.md` for the shared family covenant and `.agents/memory/` for agent
memory. Do not recreate a second project reference here.

## Running this import on Replit

- Use Node.js 24 and restore dependencies with `./node_modules/.bin/pnpm install --frozen-lockfile` (the workspace pins pnpm 11.22.0).
- Press **Run** to start the existing **Project** workflow: web preview, API on 8080, and Nia service on 3001. Managed artifact previews may assign the web port automatically.
- The API workflow starts the existing local PostgreSQL helper, applies migrations, seeds civic resources, then builds and starts the API. It does not access production data.
- The local database lives under `/tmp/niakofa-postgres`; it survives ordinary service restarts but is disposable and must not hold important data.
- Keep `SESSION_SECRET` in Replit Secrets. Maps, Stripe payments, AI responses, and production media require their own service configuration; consult the canonical reference and README. Nia remains disabled by default.
- Basic checks: `/api/healthz` for database connectivity and `/api/health` for Nia service reachability. A healthy service does not certify external-provider functionality or signed-in flows.
