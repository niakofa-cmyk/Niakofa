---
name: Niakofa Replit DB bootstrap
description: How to provision the empty Replit PostgreSQL for Niakofa; drizzle-kit fails; admin page auth was broken.
---

## The problem
Replit provisions a FRESH empty Postgres for DATABASE_URL. The api-server boots and immediately fails every query with "relation does not exist". drizzle-kit push --force also fails even on an empty DB because PostGIS schema objects trigger interactive rename-vs-add prompts (`Interactive prompts require a TTY terminal`).

## Fix (current): one-command bootstrap
`run-migrations.mjs` now detects a fresh DB (no `users` table via to_regclass), ensures the postgis extension, and executes ALL migration files from 0000 instead of baseline-marking them. So a fresh Postgres is provisioned with:
```bash
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/scripts run seed-if-empty   # 19 civic resources, idempotent
```
Existing-DB behavior unchanged (baseline-mark through BASELINE_CUTOFF, apply newer only). Verified on a scratch DB: 27 tables, 25 migrations tracked, re-run is a no-op.

**Multi-agent covenant:** never drop/reset the Replit dev DB, Railway prod DB, or Redis — rules documented in CLAUDE.md ("Multi-agent family covenant — databases"), REPLIT_GODFATHER.md, GRANDFATHER_COWORKER.md.

## Admin user
Create via register endpoint then set is_admin manually:
```bash
curl -X POST http://localhost:8080/api/users/register -H "Content-Type: application/json" \
  -d '{"email":"admin@niakofa.com","name":"Niakofa Admin","password":"...","account_type":"individual"}'
psql "$DATABASE_URL" -c "UPDATE users SET is_admin=true WHERE email='admin@niakofa.com';"
```

## Civic resources
Must be seeded manually — they don't auto-seed. 19 Tarrant County orgs across 8 categories (food, housing, health, transportation, education, legal, utilities, emergency). Insert into civic_resources with state='TX', county='Tarrant'.

## Admin page auth was broken
The admin page gate compared user input against `import.meta.env.VITE_ADMIN_SECRET ?? ""`. Since VITE_ADMIN_SECRET is never set in Replit, the gate was ALWAYS closed. Fixed: added `const { currentUser } = useAppContext()` + `useEffect(() => { if (currentUser?.is_admin) setAuthed(true); }, [currentUser?.is_admin])`. Server-side requireAdmin() already validated is_admin from JWT on every actual API call — the frontend gate was just UI convenience.

**Why:** The VITE_ env var approach requires the secret to be baked into the frontend bundle at build time. In Replit dev, that never happens. Using currentUser.is_admin (server-verified) is both more secure and always works.

**How to apply:** If admin page auth breaks again, check that AppContext exposes is_admin on the User type and that the useEffect fires after login sets currentUser.
