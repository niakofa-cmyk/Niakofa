---
name: Niakofa Replit DB bootstrap
description: How to provision the empty Replit PostgreSQL for Niakofa; drizzle-kit fails; admin page auth was broken.
---

## The problem
Replit provisions a FRESH empty Postgres for DATABASE_URL. The api-server boots and immediately fails every query with "relation does not exist". drizzle-kit push --force also fails even on an empty DB because PostGIS schema objects trigger interactive rename-vs-add prompts (`Interactive prompts require a TTY terminal`).

## Fix: apply migrations directly via psql
```bash
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
cd lib/db/migrations
for f in $(ls *.sql | sort); do psql "$DATABASE_URL" -f "$f"; done
```
The `-->statement-breakpoint` markers in migration files are valid SQL comments — psql handles them fine.

After that, seed the migration tracker so future runs of `pnpm --filter @workspace/db run migrate` are idempotent:
```sql
INSERT INTO _migrations_applied (filename) VALUES ('0000_mean_reptil.sql'), ... ON CONFLICT DO NOTHING;
```

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
