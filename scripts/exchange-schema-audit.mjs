// Operator-run, read-only schema evidence. Never repairs tables or the ledger.
import { createRequire } from "node:module";
import { EXCHANGE_SCHEMA_VALIDATION_QUERY } from "../lib/db/scripts/migration-recovery.mjs";

const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = require("pg");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const host = new URL(process.env.DATABASE_URL).hostname.replace(/^\[|\]$/g, "");
if (!["localhost", "127.0.0.1", "::1"].includes(host)
  && process.env.EXCHANGE_PRODUCTION_SCHEMA_AUDIT !== "1") {
  throw new Error("Non-local schema reads require explicit EXCHANGE_PRODUCTION_SCHEMA_AUDIT=1 operator approval.");
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /^(0|false|no|disable)$/i.test(process.env.DATABASE_SSL ?? "") ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
let client;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '10s'");
  const schema = await client.query(EXCHANGE_SCHEMA_VALIDATION_QUERY);
  const migrations = await client.query("SELECT filename FROM _migrations_applied WHERE filename LIKE '%exchange%' ORDER BY filename");
  const spatial = await client.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS postgis");
  const valid = schema.rows.length === 1
    && schema.rows[0].missing_columns.length === 0
    && schema.rows[0].missing_indexes.length === 0;
  console.log(JSON.stringify({
    read_only: true,
    schema_valid: valid,
    ...schema.rows[0],
    postgis: spatial.rows[0].postgis,
    exchange_migrations: migrations.rows.map((row) => row.filename),
  }, null, 2));
  await client.query("ROLLBACK");
  if (!valid) process.exitCode = 1;
} finally {
  if (client) client.release();
  await pool.end();
}
