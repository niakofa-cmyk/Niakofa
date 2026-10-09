# Railway application database and PostGIS status

Last checked: 2026-10-09 (America/Chicago)

## Confirmed

- The Railway production project is `precious-abundance`; its production
  environment contains live `zesty-ambition`, `PostGIS`, and `Postgres` services.
- `zesty-ambition` defines `DATABASE_URL`. The operator confirmed in Railway's
  production Variables view that its source service is **PostGIS**.
- The application target is Railway service **PostGIS**
  (`3eba44c8-fe3e-43fc-90a6-ff300bea17ca`). The ordinary **Postgres** service
  (`ee118a7d-6488-4466-999e-d4834f706625`) is separate and is not the app target.
- The PostGIS service has an existing active TCP proxy forwarding to PostgreSQL
  port 5432; it was not used or changed during this check.
- The agent did not retrieve or record a connection-string value or credential.
  This report records only the service name supplied by the operator.

## Operator-supplied read-only production results

### Ordinary Postgres service (not the application target)

- The operator's psql transcript used the Railway service ID for **Postgres**.
  It reports no installed or available PostGIS extension, no geography columns
  on `users`/`help_requests`, and no `public.exchange_listings` table.
- A later transcript after the 13:39 UTC deployment reports the same state.
  It lists the two migration-ledger tables but does not show applied entries.
  The subsequent pasted ledger commands did not return migration rows.

These results are valid for the ordinary **Postgres** service but do not describe
the application's database.

### Application PostGIS service

- The operator reports PostGIS 3.6.4, `users`, `help_requests`, and
  `exchange_listings` tables with geography columns, GiST indexes, and
  coordinate synchronization triggers; the service reportedly contains two
  Exchange listings. These details are operator-supplied; the agent did not
  issue SQL against the production database.

## Railway deployment log evidence

Railway's read-only deployment inventory shows that commits `f1eb2745`
(started 2026-10-09 06:42 UTC) and `701aa90b` (started 2026-10-09 13:36 UTC)
each triggered a successful production deployment from `main`. The newer
deployment is current. The agent did not call a deploy action; pushes to `main`
trigger this Railway service automatically.

Both deployment startup logs report `postgis extension ensured` followed by
`up to date — no new migrations to apply`. This is consistent with the operator's
confirmation that the app targets the PostGIS service. The no-new-migrations
message describes the migration runner's connection, not whether individual
Exchange listings meet the application's visibility filters.

The agent made a read-only GET to the canonical `/api/healthz` endpoint. It
returned HTTP 200 with `status: ok`, `db: connected`, and commit
`701aa90b1571396e8026aeb6b378aa4aa5e2b14f`, matching the current Railway
deployment. This health route runs `SELECT 1`; it does not verify the Exchange
table or its rows.

## Assessment and remaining verification

- The reported missing `exchange_listings` table came from inspecting the
  ordinary **Postgres** service, not the app's **PostGIS** target. The operator
  reports that the target PostGIS database has the table and two listings.
  Therefore the available evidence does not show that production's application
  database is missing Exchange listings.
- The public listing route requires an authenticated, approved account. Its
  default feed returns only rows whose status is `active` and moderation status
  is `approved`; optional nearby, neighborhood, category, type, and search
  filters can further reduce results. A `nearby=true` request without usable
  coordinates intentionally returns no rows.
- The latest deployment's HTTP-log sample contained one request to the listing
  route with status 401. That request did not pass authentication and is not
  evidence of a successful Exchange table query. No authenticated listing read
  was verified.
- Source code uses stored geography plus `ST_DWithin` when PostGIS, the
  geography column, and the expected GiST index are present; otherwise it uses
  a Haversine fallback. The live query plan and actual index use were not
  checked.
- No production SQL, configuration changes, migrations, or deployment actions
  were performed during this investigation. Railway had already deployed the
  earlier commits automatically; no further publication or deployment is being
  taken.

Use the read-only query set in
[`runbooks/production-postgis-diagnostic.sql`](runbooks/production-postgis-diagnostic.sql)
from an approved read-only session connected to the **PostGIS** service
referenced by `zesty-ambition`. Do not substitute the ordinary **Postgres**
service or a public TCP proxy. A service name or active proxy does not establish
database authorization or a read-only role. Do not copy a connection string or
public proxy endpoint into chat, logs, screenshots, or repository files. The SQL
checks schema objects and basic spatial functions; it does not certify
production query plans or application runtime behavior.
