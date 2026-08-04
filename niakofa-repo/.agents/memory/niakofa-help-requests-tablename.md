---
name: Niakofa help_requests table name
description: The actual PostgreSQL table is "help_requests", not "requests". Critical for nia-service raw SQL and any code that writes raw SQL outside Drizzle ORM.
---

# Niakofa help_requests Table Name

## The Rule
The PostgreSQL table for requests is named **`help_requests`** — this is the canonical SQL table name.

**Why:** The Drizzle ORM schema defines it as `pgTable("help_requests", ...)`. The ORM variable is `requestsTable` but the generated SQL always says `help_requests`. The `requests.ts` API route also has `FROM help_requests hr` in raw SQL.

**How to apply:**
- Any raw SQL in nia-service, api-server routes, or workers must use `FROM help_requests`, NOT `FROM requests`
- Drizzle ORM usage (`requestsTable`) is correct — it translates to `help_requests` automatically
- When reviewing nia-service/src/lib/db.ts, all `FROM requests` is wrong; it must be `FROM help_requests`

## Confirmed locations
- `lib/db/src/schema/requests.ts`: `pgTable("help_requests", ...)`
- `artifacts/api-server/src/routes/requests.ts`: `FROM help_requests hr` (raw SQL)
- `artifacts/api-server/src/workers/nia-checkin-worker.ts`: `FROM help_requests r`
- `artifacts/nia-service/src/lib/db.ts`: all queries must use `FROM help_requests`
