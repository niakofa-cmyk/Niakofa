// Operator-run, read-only schema evidence. Never repairs tables or the ledger.
import { createRequire } from "node:module";
import { EXCHANGE_SCHEMA_VALIDATION_QUERY } from "../lib/db/scripts/migration-recovery.mjs";
import { exchangeAuditTarget } from "./exchange-audit-target.mjs";

let pool;
let client;
try {
  // Validate before loading pg, opening sockets, or sending any SQL.
  const { config, local } = exchangeAuditTarget(process.env);
  const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
  const { Pool } = require("pg");
  pool = new Pool(config);
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '10s'");
  await client.query("SET LOCAL lock_timeout = '2s'");
  if (!local) {
    const role = await client.query(`
      SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls
        OR EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname NOT IN ('pg_catalog','information_schema')
            AND n.nspname NOT LIKE 'pg_toast%'
            AND c.relkind IN ('r','p')
            AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
        ) AS writable
      FROM pg_roles r WHERE r.rolname=current_user
    `);
    if (role.rows.length !== 1 || role.rows[0].writable !== false) throw new Error("READ_ONLY_ROLE_REQUIRED");
  }
  const schema = await client.query(EXCHANGE_SCHEMA_VALIDATION_QUERY);
  const spatial = await client.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS postgis");
  const historyColumns = await client.query(`
    SELECT count(*)::int AS present FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='exchange_listings' AND column_name='owner_history_removed_at')
      OR (table_name='exchange_pickup_requests' AND column_name IN ('buyer_history_removed_at','seller_history_removed_at'))
    )
  `);
  // Permission denial is unknown evidence, never an empty/missing ledger.
  let ledgerStatus = "verified";
  let filenames = [];
  await client.query("SAVEPOINT ledger_read");
  try {
    const migrations = await client.query("SELECT filename FROM public._migrations_applied WHERE filename LIKE '%exchange%' ORDER BY filename");
    filenames = migrations.rows.map((row) => row.filename);
  } catch (error) {
    if (!["42501", "42P01"].includes(error.code)) throw error;
    await client.query("ROLLBACK TO SAVEPOINT ledger_read");
    ledgerStatus = error.code === "42501" ? "permission_denied" : "missing";
  }
  const row = schema.rows[0];
  const valid = schema.rows.length === 1
    && Array.isArray(row?.missing_columns) && row.missing_columns.length === 0
    && Array.isArray(row?.missing_indexes) && row.missing_indexes.length === 0;
  const retryMigration = filenames.includes("0161_exchange_pickup_retry.sql");
  const historyMigration = filenames.includes("0198_exchange_private_history.sql");
  console.log(JSON.stringify({
    read_only: true, target_confirmed: !local, schema_valid: valid,
    ...row, postgis: spatial.rows[0].postgis,
    ledger_status: ledgerStatus, pickup_retry_migration_verified: retryMigration,
    private_history_migration_verified: historyMigration,
    private_history_columns_verified: historyColumns.rows[0].present === 3,
    exchange_migrations: filenames,
  }, null, 2));
  await client.query("ROLLBACK");
  if (!valid || ledgerStatus !== "verified" || !retryMigration || !historyMigration
    || historyColumns.rows[0].present !== 3) process.exitCode = 1;
} catch (error) {
  // Raw pg errors may contain host/user/connection details. Emit only codes.
  const safeCodes = new Set([
    "AUDIT_CONNECTION_REQUIRED", "INVALID_AUDIT_CONNECTION", "AUDIT_CONNECTION_OVERRIDE_REJECTED",
    "PRODUCTION_AUDIT_APPROVAL_REQUIRED", "UNCONFIRMED_DATABASE_TARGET",
    "PRODUCTION_AUDIT_LOCAL_TARGET_REJECTED", "READ_ONLY_ROLE_REQUIRED",
  ]);
  console.error(JSON.stringify({ audit_verified: false,
    code: safeCodes.has(error.message) ? error.message : "AUDIT_CONNECTION_OR_QUERY_FAILED",
    ...(typeof error.code === "string" && /^[A-Z0-9_]{2,40}$/.test(error.code) ? { database_code: error.code } : {}),
  }));
  process.exitCode = 1;
} finally {
  if (client) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
  if (pool) await pool.end();
}
