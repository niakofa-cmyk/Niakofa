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

On 2026-10-09, before the 06:42 UTC automatic Railway deployment, the operator
supplied a psql transcript and confirmed it came from the app's **Postgres**
service above. The agent did not connect to the production database
independently. The transcript reports:

- PostgreSQL 18.6, with no installed `postgis`, `postgis_topology`, or
  `postgis_raster` extension reported.
- `users` and `help_requests` have latitude/longitude columns, but no
  geography/geometry columns. No spatial GiST indexes or matching geography
  synchronization triggers were reported.
- The expected-column check reports that `public.exchange_listings` does not
  exist. The transcript also lists the migration-ledger tables, but not their
  applied migration entries.

These observations describe the supplied pre-deployment session only. The
extension availability catalog and post-deployment schema were not queried in
that session. Railway startup logs below report runner behavior, but do not
expose migration-ledger entries or prove the current database objects.

A later raw psql transcript attached at 2026-10-09 14:28 UTC, after the
13:39 UTC deployment, again reports no installed or available PostGIS extensions
on the confirmed **Postgres** service. It also reports
`to_regclass('public.exchange_listings')` as `NULL` and confirms that
`users`/`help_requests` have `lat`/`lng` but no geography columns. This
transcript does not include migration-ledger entries.

## Railway deployment log evidence

Railway's read-only deployment inventory shows that commits `f1eb2745`
(started 2026-10-09 06:42 UTC) and `701aa90b` (started 2026-10-09 13:36 UTC)
each triggered a successful production deployment from `main`. The newer
deployment was current at the last check (13:39 UTC). The agent did not call a
deploy action; pushes to `main` trigger this Railway service automatically.

Both deployment startup logs report `postgis extension ensured` followed by
`up to date — no new migrations to apply`. The runner emits the first message
only when `pg_available_extensions` returns PostGIS and its subsequent
`CREATE EXTENSION IF NOT EXISTS postgis` succeeds. The later psql transcript
from the confirmed **Postgres** service still reports PostGIS as neither
installed nor available. These results cannot describe the same database
instance at the same time. The logs establish that the runner used a
PostGIS-capable connection, but do not establish that it was the service
inspected by psql. Although the operator previously confirmed that the
production `DATABASE_URL` reference points to **Postgres**, the current
effective runtime target needs reconciliation without revealing the URL value.
The “no new migrations” summary is only for the runner's connection; it does
not establish the migration state of the inspected Postgres service.

## Assessment and remaining verification

- Missing PostGIS alone is not necessarily a defect. The migration runner and
  spatial query code support plain PostgreSQL with Haversine fallback when
  PostGIS is unavailable.
- Missing `exchange_listings` is not a supported fallback state. Migration
  `0159_exchange_local_pickup.sql` creates that table, while migrations
  `0181_exchange_geography.sql` and `0182_exchange_geography_repair.sql` provide
  the PostGIS and plain-PostgreSQL geography-column paths. Exchange queries
  still require the table. An earlier attached diagnostic summary reports that
  the separate **PostGIS** service has two `exchange_listings` rows. If accurate,
  those rows are in a different database from the confirmed app **Postgres**
  target and cannot satisfy Exchange queries made there.
- The runner's recovery checks do not include migration `0159` or
  `exchange_listings`. If the app Postgres ledger records `0159` as applied while
  the table is absent, the runner will skip the migration and its recovery
  checks will not re-queue it. This is a plausible schema-drift mechanism, not
  yet confirmed because the app Postgres ledger entries have not been supplied.
- The updated diagnostic now reports the latest entries from both supported
  ledgers, marks missing or empty ledgers, and reports PostGIS availability.
  Its ledger section has not yet been run against the app Postgres service.
  Current Exchange route behavior and production query plans also remain
  unverified.
- The production Postgres transcript confirms the table remains absent after
  the deployments. The logs' “no new migrations” result belongs to a
  PostGIS-capable connection whose target has not been reconciled with that
  Postgres service. The exact cause requires the current `DATABASE_URL`
  reference source (name only) and the app Postgres ledger rows for migrations
  `0159`, `0181`, and `0182`.
- The agent did not connect to production Postgres, issue SQL against
  production, change `DATABASE_URL`, or explicitly deploy. Automatic
  production deployments did occur after the commits to `main`; no further
  publication or deployment action is being taken.

Use the read-only query set in
[`runbooks/production-postgis-diagnostic.sql`](runbooks/production-postgis-diagnostic.sql)
from an approved read-only session connected to the **Postgres** service
referenced by `zesty-ambition`. Do not substitute the separate PostGIS service or
its TCP proxy. A service name or active proxy does not establish database
authorization, PostGIS availability, or a read-only role. Do not copy a
connection string or public proxy endpoint into chat, logs, screenshots, or
repository files. The SQL checks schema objects and basic spatial functions; it
does not certify production query plans or application runtime behavior.
