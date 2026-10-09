-- Read-only diagnostic for the Railway PostGIS service referenced by
-- zesty-ambition's DATABASE_URL. Do NOT run against the separate ordinary
-- Postgres service as a substitute for the app's PostGIS target.
-- It reads catalogs and tests PostGIS functions on constant points only; it
-- does not read application rows or change database state.
--
-- Run from psql only after establishing an approved connection to the app's
-- PostGIS service with a read-only role. A connection to the ordinary Postgres
-- service is not a substitute.

BEGIN TRANSACTION READ ONLY;

-- 1. Connection identity and read-only transaction state; no host or URL.
SELECT
  current_database() AS database_name,
  current_user AS database_role,
  current_schema() AS current_schema,
  current_setting('server_version') AS server_version,
  current_setting('transaction_read_only') AS transaction_read_only;

-- 2. Installed extensions.
SELECT
  e.extname AS extension_name,
  e.extversion AS extension_version,
  n.nspname AS extension_schema
FROM pg_extension AS e
JOIN pg_namespace AS n
  ON n.oid = e.extnamespace
ORDER BY e.extname;

-- 3. Whether the server has PostGIS files available for installation. This
-- reports extension availability, not the current role's CREATE privilege.
SELECT
  expected.extension_name,
  available.default_version IS NOT NULL AS available_to_install,
  available.default_version,
  available.installed_version
FROM (VALUES ('postgis'::text)) AS expected(extension_name)
LEFT JOIN pg_available_extensions AS available
  ON available.name = expected.extension_name;

-- 4. Request/routing/helper-related application tables and views.
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    WHEN 'f' THEN 'foreign table'
    ELSE c.relkind::text
  END AS object_type
FROM pg_class AS c
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND c.relname ~* '(request|route|helper|location|arrival|dispatch|trip|job|user|profile)'
ORDER BY n.nspname, c.relname;

-- 5. Spatial columns in any application schema. format_type includes type
-- modifiers (for example, geography(Point,4326)) when they are present.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.attname AS column_name,
  t.typname AS spatial_type,
  format_type(a.atttypid, a.atttypmod) AS formatted_type,
  a.attnotnull AS is_not_null
FROM pg_attribute AS a
JOIN pg_class AS c
  ON c.oid = a.attrelid
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
JOIN pg_type AS t
  ON t.oid = a.atttypid
WHERE a.attnum > 0
  AND NOT a.attisdropped
  AND t.typname IN ('geometry', 'geography')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, a.attname;

-- 6. Niakofa geography columns expected by the canonical migrations.
-- A text column is a fallback, not evidence of PostGIS geography support.
WITH expected(schema_name, table_name, column_name) AS (
  VALUES
    ('public', 'users', 'geog'),
    ('public', 'help_requests', 'geog'),
    ('public', 'exchange_listings', 'geog')
)
SELECT
  e.schema_name,
  e.table_name,
  e.column_name,
  c.oid IS NOT NULL AS table_exists,
  a.attnum IS NOT NULL AS column_exists,
  CASE
    WHEN a.attnum IS NOT NULL THEN format_type(a.atttypid, a.atttypmod)
    ELSE NULL
  END AS column_type
FROM expected AS e
LEFT JOIN pg_namespace AS n
  ON n.nspname = e.schema_name
LEFT JOIN pg_class AS c
  ON c.relnamespace = n.oid
 AND c.relname = e.table_name
 AND c.relkind IN ('r', 'p')
LEFT JOIN pg_attribute AS a
  ON a.attrelid = c.oid
 AND a.attname = e.column_name
 AND a.attnum > 0
 AND NOT a.attisdropped
ORDER BY e.table_name;

-- 7. GiST/SP-GiST indexes that directly include spatial columns. Definitions
-- show the indexed expression and any partial-index predicate.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.attname AS spatial_column,
  i.relname AS index_name,
  am.amname AS index_method,
  ix.indisvalid AS index_is_valid,
  ix.indisready AS index_is_ready,
  pg_get_indexdef(i.oid) AS index_definition
FROM pg_attribute AS a
JOIN pg_class AS c
  ON c.oid = a.attrelid
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
JOIN pg_index AS ix
  ON ix.indrelid = c.oid
JOIN pg_class AS i
  ON i.oid = ix.indexrelid
JOIN pg_am AS am
  ON am.oid = i.relam
JOIN pg_type AS t
  ON t.oid = a.atttypid
WHERE a.attnum > 0
  AND NOT a.attisdropped
  AND a.attnum = ANY(ix.indkey)
  AND am.amname IN ('gist', 'spgist')
  AND t.typname IN ('geometry', 'geography')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, a.attname, i.relname;

-- 8. Canonical index names. Check the definitions above to ensure that an
-- existing index covers the expected table and geography column.
WITH expected(schema_name, table_name, index_name) AS (
  VALUES
    ('public', 'users', 'users_geog_gix'),
    ('public', 'help_requests', 'help_requests_geog_gix'),
    ('public', 'exchange_listings', 'exchange_listings_geog_gist_idx')
)
SELECT
  e.schema_name,
  e.table_name,
  e.index_name,
  i.oid IS NOT NULL AS index_exists,
  ix.indexrelid IS NOT NULL AS index_attached_to_expected_table,
  am.amname AS access_method,
  ix.indisvalid AS index_is_valid,
  ix.indisready AS index_is_ready,
  pg_get_indexdef(i.oid) AS index_definition
FROM expected AS e
LEFT JOIN pg_namespace AS n
  ON n.nspname = e.schema_name
LEFT JOIN pg_class AS t
  ON t.relnamespace = n.oid
 AND t.relname = e.table_name
 AND t.relkind IN ('r', 'p')
LEFT JOIN pg_class AS i
  ON i.relnamespace = n.oid
 AND i.relname = e.index_name
 AND i.relkind IN ('i', 'I')
LEFT JOIN pg_index AS ix
  ON ix.indexrelid = i.oid
 AND ix.indrelid = t.oid
LEFT JOIN pg_am AS am
  ON am.oid = i.relam
ORDER BY e.table_name;

-- 9. Expected geography synchronization triggers.
-- O=origin/local, D=disabled, R=replica, A=always.
WITH expected(schema_name, table_name, trigger_name) AS (
  VALUES
    ('public', 'users', 'trg_users_sync_geog'),
    ('public', 'help_requests', 'trg_help_requests_sync_geog'),
    ('public', 'exchange_listings', 'trg_exchange_listings_sync_geog')
)
SELECT
  e.schema_name,
  e.table_name,
  e.trigger_name,
  t.oid IS NOT NULL AS trigger_exists,
  t.tgenabled AS trigger_mode,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM expected AS e
LEFT JOIN pg_namespace AS n
  ON n.nspname = e.schema_name
LEFT JOIN pg_class AS c
  ON c.relnamespace = n.oid
 AND c.relname = e.table_name
 AND c.relkind IN ('r', 'p')
LEFT JOIN pg_trigger AS t
  ON t.tgrelid = c.oid
 AND t.tgname = e.trigger_name
 AND NOT t.tgisinternal
ORDER BY e.table_name;

-- 10. Migration ledgers, without assuming which runner is installed.
SELECT
  table_schema,
  table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_name IN ('_migrations_applied', '__drizzle_migrations')
ORDER BY table_schema, table_name;

-- 11. Latest recorded migration entries from each supported ledger.
-- These psql conditionals keep this section safe when either ledger is absent.
-- The app runner creates its ledger in public; the legacy Drizzle ledger is in
-- the drizzle schema. The latest 20 entries are shown. Drizzle stores hashes
-- rather than migration filenames, so its hash is the recorded identifier.
SELECT to_regclass('public._migrations_applied') IS NOT NULL
  AS has_app_migration_ledger
\gset
\if :has_app_migration_ledger
SELECT
  '_migrations_applied' AS ledger,
  filename AS migration,
  applied_at AS recorded_at,
  'applied' AS status
FROM public._migrations_applied
UNION ALL
SELECT
  '_migrations_applied',
  NULL::text,
  NULL::timestamptz,
  'empty'
WHERE NOT EXISTS (SELECT 1 FROM public._migrations_applied)
ORDER BY recorded_at DESC NULLS LAST, migration DESC NULLS LAST
LIMIT 20;
\else
SELECT
  '_migrations_applied' AS ledger,
  NULL::text AS migration,
  NULL::timestamptz AS recorded_at,
  'absent' AS status;
\endif

SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
  AS has_drizzle_migration_ledger
\gset
\if :has_drizzle_migration_ledger
SELECT
  'drizzle.__drizzle_migrations' AS ledger,
  id,
  hash,
  created_at,
  CASE
    WHEN created_at IS NOT NULL
      THEN to_timestamp(created_at::double precision / 1000.0)
    ELSE NULL
  END AS recorded_at,
  'applied' AS status
FROM drizzle.__drizzle_migrations
UNION ALL
SELECT
  'drizzle.__drizzle_migrations',
  NULL::integer,
  NULL::text,
  NULL::bigint,
  NULL::timestamptz,
  'empty'
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations)
ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
LIMIT 20;
\else
SELECT
  'drizzle.__drizzle_migrations' AS ledger,
  NULL::integer AS id,
  NULL::text AS hash,
  NULL::bigint AS created_at,
  NULL::timestamptz AS recorded_at,
  'absent' AS status;
\endif

-- 12. Foreign keys for request/routing/helper-related tables.
SELECT
  ns_child.nspname AS schema_name,
  child.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS child
  ON child.oid = con.conrelid
JOIN pg_namespace AS ns_child
  ON ns_child.oid = child.relnamespace
WHERE con.contype = 'f'
  AND child.relname ~* '(request|route|helper|location|arrival|dispatch|trip|job)'
  AND ns_child.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY ns_child.nspname, child.relname, con.conname;

-- 13. Execute a PostGIS smoke test only when the extension is installed.
-- Uses constant points only; no application coordinates or rows are read.
DO $postgis_smoke$
DECLARE
  full_version text;
  spatial_meta record;
  point_wkt text;
  point_srid integer;
  within_200m boolean;
  distance_meters double precision;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE 'PostGIS is not installed in this database; spatial function test skipped.';
    RETURN;
  END IF;

  FOR spatial_meta IN EXECUTE $metadata$
    SELECT
      'geometry'::text AS spatial_kind,
      f_table_schema AS schema_name,
      f_table_name AS table_name,
      f_geometry_column AS column_name,
      type AS spatial_type,
      srid,
      coord_dimension
    FROM geometry_columns
    UNION ALL
    SELECT
      'geography'::text AS spatial_kind,
      f_table_schema AS schema_name,
      f_table_name AS table_name,
      f_geography_column AS column_name,
      type AS spatial_type,
      srid,
      coord_dimension
    FROM geography_columns
    ORDER BY spatial_kind, schema_name, table_name, column_name
  $metadata$
  LOOP
    RAISE NOTICE 'Spatial metadata: kind=%, schema=%, table=%, column=%, type=%, SRID=%, dimensions=%',
      spatial_meta.spatial_kind,
      spatial_meta.schema_name,
      spatial_meta.table_name,
      spatial_meta.column_name,
      spatial_meta.spatial_type,
      spatial_meta.srid,
      spatial_meta.coord_dimension;
  END LOOP;

  EXECUTE 'SELECT PostGIS_Full_Version()'
    INTO full_version;

  EXECUTE $query$
    SELECT
      ST_AsText(ST_SetSRID(ST_MakePoint(0, 0), 4326)),
      ST_SRID(ST_SetSRID(ST_MakePoint(0, 0), 4326)),
      ST_DWithin(
        ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography,
        ST_SetSRID(ST_MakePoint(0.001, 0), 4326)::geography,
        200
      ),
      ST_Distance(
        ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography,
        ST_SetSRID(ST_MakePoint(0.001, 0), 4326)::geography
      )
  $query$
    INTO point_wkt, point_srid, within_200m, distance_meters;

  RAISE NOTICE 'PostGIS version: %', full_version;
  RAISE NOTICE 'Point smoke test: %, SRID %, within 200m %, distance %m',
    point_wkt, point_srid, within_200m, distance_meters;
END;
$postgis_smoke$;

ROLLBACK;
