-- Read-only PostGIS schema diagnostic.
-- Confirm the session targets Railway's PostGIS service before running.
-- This script does not read application rows or change database state.

BEGIN TRANSACTION READ ONLY;

-- Database identity and server version; no host or connection string is shown.
SELECT
  current_database() AS database_name,
  current_setting('server_version') AS server_version;

-- An empty result means PostGIS is not installed in this database.
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname = 'postgis';

-- Expected application geography columns from the canonical migrations.
-- The type is included so a text fallback is distinguishable from geography.
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

-- Expected GiST index names from the canonical migrations. The definition
-- indicates whether each index is actually built on the expected geog column.
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

-- Expected geography synchronization triggers.
-- trigger_enabled_state uses PostgreSQL's tgenabled code: O=origin/local,
-- D=disabled, R=replica, A=always.
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

-- Discover migration ledgers without assuming either is present.
SELECT
  table_schema,
  table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_name IN ('_migrations_applied', '__drizzle_migrations')
ORDER BY table_schema, table_name;

ROLLBACK;
