import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { EXCHANGE_MIGRATION_RECOVERY_CHECK, requeueMissingMigrations, verifyExchangeSchema } from "./migration-recovery.mjs";

const exec = promisify(execFile);
const enabled = process.env.DISPOSABLE_EXCHANGE_MIGRATION_TEST === "1";

test("Exchange fresh install, upgrades, index semantics and missing-object recovery", {
  skip: !enabled,
  timeout: 180000,
}, async (t) => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Disposable migration tests require loopback PostgreSQL");
  const name = `exchange_migration_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: url.href, ssl: false });
  const childUrl = new URL(url);
  childUrl.pathname = `/${name}`;
  let db;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    db = new pg.Pool({ connectionString: childUrl.href, ssl: false });
    const query = (sql, params) => db.query(sql, params);
    const withRetry = (operation) => operation();
    const migration = (file) => readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    const run = () => exec(process.execPath, [new URL("./run-migrations.mjs", import.meta.url).pathname], {
      env: { ...process.env, DATABASE_URL: childUrl.href, DATABASE_SSL: "false" },
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
    });

    await t.test("fresh database executes the complete real migration sequence", async () => {
      await run();
      await verifyExchangeSchema({ query, withRetry });
      const result = await query("SELECT filename FROM _migrations_applied WHERE filename = $1", ["0161_exchange_pickup_retry.sql"]);
      assert.equal(result.rowCount, 1);
    });
    await t.test("up-to-date database starts again without replaying migrations", async () => {
      const result = await run();
      assert.match(result.stdout, /up to date/);
    });
    await t.test("nearby discovery uses the migrated index at realistic local volume", async () => {
      const owner = await query("INSERT INTO users(name,email,approval_status) VALUES('Disposable benchmark','exchange-volume@example.invalid','approved') RETURNING id");
      await query(`
        INSERT INTO exchange_listings(seller_id,title,description,neighborhood,latitude,longitude,status,moderation_status)
        SELECT $1, 'Disposable volume fixture', 'Isolated local performance fixture', 'Coarse area',
          32.7555 + ((n % 1000) - 500) / 1000.0,
          -97.3308 + (((n / 1000) % 20) - 10) / 100.0,
          CASE WHEN n % 5 = 0 THEN 'reserved' ELSE 'active' END,
          CASE WHEN n % 7 = 0 THEN 'held' ELSE 'approved' END
        FROM generate_series(1, 20000) n
      `, [owner.rows[0].id]);
      await query("ANALYZE exchange_listings");
      const plan = await query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id FROM exchange_listings
        WHERE status='active' AND moderation_status='approved'
          AND latitude BETWEEN 32.73 AND 32.78
          AND longitude BETWEEN -97.36 AND -97.31
      `);
      assert.match(JSON.stringify(plan.rows), /exchange_listings_geo_idx/);
      const result = await exec(process.execPath, [new URL("../../../scripts/exchange-spatial-benchmark.mjs", import.meta.url).pathname], {
        env: { ...process.env, DATABASE_URL: childUrl.href, BENCHMARK_ITERATIONS: "25" },
        timeout: 30000,
      });
      console.log("Disposable 20,000-listing benchmark:\n" + result.stdout);
    });
    await t.test("same-name nonunique index cannot masquerade as the active-request constraint", async () => {
      await query("DROP INDEX exchange_pickup_requests_one_active_per_buyer_listing_idx");
      await query("CREATE INDEX exchange_pickup_requests_one_active_per_buyer_listing_idx ON exchange_pickup_requests(listing_id,buyer_id)");
      await assert.rejects(verifyExchangeSchema({ query, withRetry }), /one_active_per_buyer_listing_idx/);
      await query("DROP INDEX exchange_pickup_requests_one_active_per_buyer_listing_idx");
      await query("CREATE UNIQUE INDEX exchange_pickup_requests_one_active_per_buyer_listing_idx ON exchange_pickup_requests(listing_id,buyer_id) WHERE status='requested'");
      await assert.rejects(verifyExchangeSchema({ query, withRetry }), /one_active_per_buyer_listing_idx/);
      await query(await migration("0161_exchange_pickup_retry.sql"));
      await verifyExchangeSchema({ query, withRetry });
    });
    await t.test("missing later column fails startup and the original migration restores it", async () => {
      await query("ALTER TABLE exchange_pickup_requests DROP COLUMN pickup_note");
      await assert.rejects(run(), (error) => {
        assert.match(error.stderr, /Exchange schema is incomplete.*pickup_note/);
        return true;
      });
      await query("ALTER TABLE exchange_pickup_requests ADD COLUMN pickup_note text");
      await verifyExchangeSchema({ query, withRetry });
    });
    await t.test("missing base tables with applied upgrades stop without erasing the ledger", async () => {
      const before = await query("SELECT count(*)::int AS count FROM _migrations_applied");
      await query("DROP TABLE exchange_pickup_requests CASCADE");
      await assert.rejects(run(), (error) => {
        assert.match(error.stderr, /Base-table replay cannot restore lost data or foreign keys/);
        return true;
      });
      const after = await query("SELECT count(*)::int AS count FROM _migrations_applied");
      assert.equal(after.rows[0].count, before.rows[0].count);
      assert.equal((await query("SELECT to_regclass('exchange_pickup_requests') AS relation")).rows[0].relation, null);
    });
    await t.test("base-only interrupted installation can safely requeue and recreate the missing table", async () => {
      await query("DELETE FROM _migrations_applied WHERE filename > $1 AND filename LIKE '%exchange%'", [EXCHANGE_MIGRATION_RECOVERY_CHECK.file]);
      await requeueMissingMigrations({ checks: [EXCHANGE_MIGRATION_RECOVERY_CHECK], query, withRetry, logger: { log() {}, warn: assert.fail } });
      assert.equal((await query("SELECT filename FROM _migrations_applied WHERE filename = $1", [EXCHANGE_MIGRATION_RECOVERY_CHECK.file])).rowCount, 0);
      await query(await migration(EXCHANGE_MIGRATION_RECOVERY_CHECK.file));
      assert.notEqual((await query("SELECT to_regclass('exchange_pickup_requests') AS relation")).rows[0].relation, null);
    });
  } finally {
    if (db) await db.end();
    // Only this UUID-named database created by the test is removed.
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
