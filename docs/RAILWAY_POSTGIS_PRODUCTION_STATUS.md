# Railway production PostGIS status

Last checked: 2026-10-08 (America/Chicago)

## Confirmed

- The Railway production project is `precious-abundance`; its production
  environment contains live `zesty-ambition`, `PostGIS`, and `Postgres` services.
- `zesty-ambition` defines `DATABASE_URL`. The operator confirmed in Railway's
  Variables view that its source service is **PostGIS**.
- The PostGIS service has an existing active TCP proxy forwarding to PostgreSQL
  port 5432. It was inspected only; no proxy or service setting was changed.
- Both database services expose similarly named PostgreSQL variables. Railway's
  read-only metadata response listed variable names but omitted the reference
  expressions, so service names alone could not identify the source.
- No connection string or resolved variable value was retrieved or recorded.

This confirms the configured reference target, not a successful live database
query. The presence or health of a Railway service does not prove its schema.

## Still unverified

No production SQL was run for this check. The following remain unverified:

- whether the `postgis` extension is installed in the target database;
- whether the required `geography` columns, synchronization triggers, and GiST
  indexes exist and are valid;
- whether the expected migrations have been applied; and
- whether production query plans use the intended spatial indexes.

Use the read-only query set in
[`runbooks/production-postgis-diagnostic.sql`](runbooks/production-postgis-diagnostic.sql)
from an approved operator-controlled PostgreSQL session after confirming that
the session targets Railway's PostGIS service. The existing TCP proxy provides
network forwarding only; it does not establish database authorization or a
read-only role. Do not copy a connection string or public proxy endpoint into
chat, logs, screenshots, or repository files. The SQL checks schema objects; it
does not certify production query plans or application runtime behavior.
