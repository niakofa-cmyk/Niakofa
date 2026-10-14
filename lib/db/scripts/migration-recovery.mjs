export const EXCHANGE_MIGRATION_RECOVERY_CHECK = {
  label: "Exchange listings and pickup requests (0159)",
  file: "0159_exchange_local_pickup.sql",
  // Later Exchange migrations are not all replay-safe (0171 creates an enum
  // and dispute table without IF NOT EXISTS). Recreating only the base tables
  // would also silently lose their later columns and inbound FK guarantees.
  unsafeReplayAfter: "0159_exchange_local_pickup.sql",
  fatalOnError: true,
  query: `SELECT
    to_regclass('public.exchange_listings') IS NOT NULL
    AND to_regclass('public.exchange_pickup_requests') IS NOT NULL AS exists`,
};

// Keep this list aligned with the Drizzle Exchange listing and pickup-request
// tables. Run it after pending migrations so older databases can be upgraded
// before their final schema is checked.
export const EXCHANGE_SCHEMA_VALIDATION_QUERY = `
  WITH expected_columns(table_name, column_name) AS (
    VALUES
      ('exchange_listings', 'id'),
      ('exchange_listings', 'seller_id'),
      ('exchange_listings', 'listing_type'),
      ('exchange_listings', 'resource_type'),
      ('exchange_listings', 'title'),
      ('exchange_listings', 'description'),
      ('exchange_listings', 'category'),
      ('exchange_listings', 'condition'),
      ('exchange_listings', 'neighborhood'),
      ('exchange_listings', 'pickup_notes'),
      ('exchange_listings', 'pickup_location_type'),
      ('exchange_listings', 'latitude'),
      ('exchange_listings', 'longitude'),
      ('exchange_listings', 'geog'),
      ('exchange_listings', 'status'),
      ('exchange_listings', 'moderation_status'),
      ('exchange_listings', 'moderation_reason'),
      ('exchange_listings', 'moderation_hold_at'),
      ('exchange_listings', 'moderation_hold_reason'),
      ('exchange_listings', 'moderation_reviewed_by'),
      ('exchange_listings', 'moderation_reviewed_at'),
      ('exchange_listings', 'archived_at'),
      ('exchange_listings', 'archive_reason'),
      ('exchange_listings', 'created_at'),
      ('exchange_listings', 'updated_at'),
      ('exchange_pickup_requests', 'id'),
      ('exchange_pickup_requests', 'listing_id'),
      ('exchange_pickup_requests', 'buyer_id'),
      ('exchange_pickup_requests', 'note'),
      ('exchange_pickup_requests', 'pickup_area'),
      ('exchange_pickup_requests', 'pickup_location_type'),
      ('exchange_pickup_requests', 'pickup_note'),
      ('exchange_pickup_requests', 'proposed_window'),
      ('exchange_pickup_requests', 'status'),
      ('exchange_pickup_requests', 'buyer_confirmed_at'),
      ('exchange_pickup_requests', 'seller_confirmed_at'),
      ('exchange_pickup_requests', 'accepted_at'),
      ('exchange_pickup_requests', 'coordination_expires_at'),
      ('exchange_pickup_requests', 'cancelled_at'),
      ('exchange_pickup_requests', 'expired_at'),
      ('exchange_pickup_requests', 'expiry_notified_at'),
      ('exchange_pickup_requests', 'completed_at'),
      ('exchange_pickup_requests', 'created_at'),
      ('exchange_pickup_requests', 'updated_at')
  ),
  expected_indexes(table_name, index_name) AS (
    VALUES
      ('exchange_listings', 'exchange_listings_status_idx'),
      ('exchange_listings', 'exchange_listings_seller_idx'),
      ('exchange_listings', 'exchange_listings_type_idx'),
      ('exchange_listings', 'exchange_listings_geo_idx'),
      ('exchange_pickup_requests', 'exchange_pickup_requests_listing_idx'),
      ('exchange_pickup_requests', 'exchange_pickup_requests_buyer_idx'),
      ('exchange_pickup_requests', 'exchange_pickup_requests_one_active_per_buyer_listing_idx')
    UNION ALL
    SELECT 'exchange_listings', 'exchange_listings_geog_gist_idx'
    WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')
  )
  SELECT
    ARRAY(
      SELECT format('%I.%I', expected.table_name, expected.column_name)
      FROM expected_columns AS expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS actual
        WHERE actual.table_schema = 'public'
          AND actual.table_name = expected.table_name
          AND actual.column_name = expected.column_name
      )
      ORDER BY expected.table_name, expected.column_name
    ) AS missing_columns,
    ARRAY(
      SELECT format('%I.%I', expected.table_name, expected.index_name)
      FROM expected_indexes AS expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class AS index_class
        JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
        JOIN pg_index AS index_metadata ON index_metadata.indexrelid = index_class.oid
        JOIN pg_class AS table_class ON table_class.oid = index_metadata.indrelid
        JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
        WHERE index_namespace.nspname = 'public'
          AND table_namespace.nspname = 'public'
          AND table_class.relname = expected.table_name
          AND index_class.relname = expected.index_name
          AND index_metadata.indisvalid
          AND index_metadata.indisready
           AND (
             expected.index_name <> 'exchange_pickup_requests_one_active_per_buyer_listing_idx'
             OR (
               index_metadata.indisunique
               AND index_metadata.indnkeyatts = 2
               AND index_metadata.indnatts = 2
               AND pg_get_indexdef(index_class.oid, 1, true) = 'listing_id'
               AND pg_get_indexdef(index_class.oid, 2, true) = 'buyer_id'
               AND regexp_replace(pg_get_expr(index_metadata.indpred, index_metadata.indrelid), '\\s+', '', 'g')
                 = '(status=ANY(ARRAY[''requested''::text,''accepted''::text]))'
             )
           )
           AND (
             expected.index_name <> 'exchange_listings_geog_gist_idx'
             OR (
               (SELECT amname FROM pg_am WHERE oid = index_class.relam) = 'gist'
               AND pg_get_indexdef(index_class.oid, 1, true) = 'geog'
             )
           )
      )
      ORDER BY expected.table_name, expected.index_name
    ) AS missing_indexes
`;

export async function verifyExchangeSchema({ query, withRetry }) {
  const { rows } = await withRetry(
    () => query(EXCHANGE_SCHEMA_VALIDATION_QUERY),
    "Exchange schema validation"
  );
  if (!rows[0] || !Array.isArray(rows[0].missing_columns) || !Array.isArray(rows[0].missing_indexes)) {
    throw new Error("[migrate] Exchange schema verification returned no valid result; refusing to start.");
  }
  const { missing_columns, missing_indexes } = rows[0];
  if (missing_columns.length > 0 || missing_indexes.length > 0) {
    const missing = [
      ...(missing_columns.length > 0 ? [`columns: ${missing_columns.join(", ")}`] : []),
      ...(missing_indexes.length > 0 ? [`indexes: ${missing_indexes.join(", ")}`] : []),
    ].join("; ");
    throw new Error(
      `[migrate] Exchange schema is incomplete; refusing to start. Missing ${missing}. ` +
      "Repair the Exchange schema using the relevant migrations or a database restore, then rerun migrations."
    );
  }
}

export async function requeueMissingMigrations({ checks, query, withRetry, logger = console }) {
  for (const { label, file, query: checkQuery, fatalOnError = false, unsafeReplayAfter } of checks) {
    try {
      const { rows } = await withRetry(() => query(checkQuery), `recovery check: ${label}`);
      if (!rows[0].exists) {
        if (unsafeReplayAfter) {
          const { rows: dependencies } = await withRetry(
            () => query(
              `SELECT filename FROM _migrations_applied
               WHERE filename > $1 AND filename LIKE '%exchange%' ORDER BY filename`,
              [unsafeReplayAfter]
            ),
            `recovery dependency check: ${file}`
          );
          if (dependencies.length) {
            throw new Error(
              `Dependent Exchange migrations are already applied (${dependencies.map((row) => row.filename).join(", ")}). ` +
              "Base-table replay cannot restore lost data or foreign keys; use a reviewed restore or corrective migration."
            );
          }
        }
        const { rowCount } = await withRetry(
          () => query(`DELETE FROM _migrations_applied WHERE filename = $1`, [file]),
          `recovery delete: ${file}`
        );
        if (rowCount > 0) {
          logger.log(`[migrate] recovery: "${label}" missing but "${file}" was marked applied — re-queuing it`);
        }
      }
    } catch (err) {
      if (fatalOnError) {
        throw new Error(
          `[migrate] cannot verify or re-queue "${file}" (${label}); refusing to start because the Exchange schema may be missing. Repair the database and rerun migrations.`,
          { cause: err }
        );
      }
      // A check failure is non-fatal for the existing legacy recovery checks.
      logger.warn(`[migrate] recovery check skipped for "${file}":`, err.message);
    }
  }
}
