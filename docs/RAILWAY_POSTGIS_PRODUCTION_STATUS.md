# Railway application database and PostGIS status

Last checked: 2026-10-09 (America/Chicago)

## Confirmed

- The Railway production project is `precious-abundance`; its production
  environment contains live `zesty-ambition`, `PostGIS`, and `Postgres` services.
- `zesty-ambition` defines `DATABASE_URL`. The operator confirmed in Railway's
  Variables view that its source service is **Postgres**.
- The application target is Railway service **Postgres**
  (`ee118a7d-6488-4466-999e-d4834f706625`). The operator confirmed that the
  psql session summarized below connected to this service.
- The separate **PostGIS** service
  (`3eba44c8-fe3e-43fc-90a6-ff300bea17ca`) is live but is not the application
  target.
- The PostGIS service has an existing active TCP proxy forwarding to PostgreSQL
  port 5432. That proxy belongs to the separate service and was not used or
  changed during this check.
- Both database services expose similarly named PostgreSQL variables. Railway's
  read-only metadata response listed variable names but omitted the reference
  expressions, so service names alone could not identify the source.
- No connection string or resolved variable value was retrieved or recorded.

## Operator-supplied read-only production results

On 2026-10-09, the operator supplied a psql transcript and confirmed it came
from the app's **Postgres** service above. The agent did not connect to the
production database independently. The transcript reports:

- PostgreSQL 18.6, with no installed `postgis`, `postgis_topology`, or
  `postgis_raster` extension reported.
- `users` and `help_requests` have latitude/longitude columns, but no
  geography/geometry columns. No spatial GiST indexes or matching geography
  synchronization triggers were reported.
- The expected-column check reports that `public.exchange_listings` does not
  exist. The transcript also lists the migration-ledger tables, but not their
  applied migration entries.

These observations describe the supplied session only; the extension
availability catalog, exact migration state, and application runtime were not
independently checked.

## Assessment and remaining verification

- Missing PostGIS alone is not necessarily a defect. The migration runner and
  spatial query code support plain PostgreSQL with Haversine fallback when
  PostGIS is unavailable.
- Missing `exchange_listings` is not a supported fallback state. Migration
  `0159_exchange_local_pickup.sql` creates that table, while migrations
  `0181_exchange_geography.sql` and `0182_exchange_geography_repair.sql` provide
  the PostGIS and plain-PostgreSQL geography-column paths. Exchange queries
  still require the table. The reported absence is consistent with an
  incomplete schema or later schema drift, but the transcript does not identify
  which migration or change caused it.
- The applied migration entries, whether PostGIS is available to install, live
  Exchange route behavior, and production query plans remain unverified.
- No production migration, database change, `DATABASE_URL` change, or deploy
  was performed.

Use the read-only query set in
[`runbooks/production-postgis-diagnostic.sql`](runbooks/production-postgis-diagnostic.sql)
from an approved read-only session connected to the **Postgres** service
referenced by `zesty-ambition`. Do not substitute the separate PostGIS service or
its TCP proxy. A service name or active proxy does not establish database
authorization, PostGIS availability, or a read-only role. Do not copy a
connection string or public proxy endpoint into chat, logs, screenshots, or
repository files. The SQL checks schema objects and basic spatial functions; it
does not certify production query plans or application runtime behavior.
