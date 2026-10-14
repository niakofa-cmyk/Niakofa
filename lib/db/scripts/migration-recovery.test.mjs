import assert from "node:assert/strict";
import test from "node:test";

import {
  EXCHANGE_MIGRATION_RECOVERY_CHECK,
  EXCHANGE_SCHEMA_VALIDATION_QUERY,
  requeueMissingMigrations,
  verifyExchangeSchema,
} from "./migration-recovery.mjs";

function makeDatabase({ exchangeTablesExist, migrationRecorded = true }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === EXCHANGE_MIGRATION_RECOVERY_CHECK.query) {
        return { rows: [{ exists: exchangeTablesExist }] };
      }
      if (sql.startsWith("DELETE FROM _migrations_applied")) {
        assert.equal(params[0], EXCHANGE_MIGRATION_RECOVERY_CHECK.file);
        return { rowCount: migrationRecorded ? 1 : 0 };
      }
      throw new Error(`Unexpected SQL in migration recovery test: ${sql}`);
    },
  };
}

const withRetry = (operation) => operation();

test("re-queues migration 0159 when either Exchange table is missing", async () => {
  const db = makeDatabase({ exchangeTablesExist: false });
  const messages = [];

  await requeueMissingMigrations({
    checks: [EXCHANGE_MIGRATION_RECOVERY_CHECK],
    query: db.query.bind(db),
    withRetry,
    logger: { log: (message) => messages.push(message), warn: assert.fail },
  });

  assert.equal(db.calls.length, 2);
  assert.match(db.calls[1].sql, /^DELETE FROM _migrations_applied/);
  assert.deepEqual(db.calls[1].params, [EXCHANGE_MIGRATION_RECOVERY_CHECK.file]);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /re-queuing it/);
  assert.match(EXCHANGE_MIGRATION_RECOVERY_CHECK.query, /exchange_listings/);
  assert.match(EXCHANGE_MIGRATION_RECOVERY_CHECK.query, /exchange_pickup_requests/);
});

test("leaves migration 0159 marked applied when both Exchange tables exist", async () => {
  const db = makeDatabase({ exchangeTablesExist: true });

  await requeueMissingMigrations({
    checks: [EXCHANGE_MIGRATION_RECOVERY_CHECK],
    query: db.query.bind(db),
    withRetry,
    logger: { log: assert.fail, warn: assert.fail },
  });

  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].sql, EXCHANGE_MIGRATION_RECOVERY_CHECK.query);
});

test("fails closed with a repair message if Exchange table verification fails", async () => {
  await assert.rejects(
    requeueMissingMigrations({
      checks: [EXCHANGE_MIGRATION_RECOVERY_CHECK],
      query: async () => {
        throw new Error("database query failed");
      },
      withRetry,
      logger: { log: assert.fail, warn: assert.fail },
    }),
    /refusing to start.*Repair the database and rerun migrations/
  );
});

test("accepts a complete Exchange listing and pickup-request schema", async () => {
  let checkedQuery;

  await verifyExchangeSchema({
    query: async (sql) => {
      checkedQuery = sql;
      return { rows: [{ missing_columns: [], missing_indexes: [] }] };
    },
    withRetry,
  });

  assert.equal(checkedQuery, EXCHANGE_SCHEMA_VALIDATION_QUERY);
  assert.match(checkedQuery, /information_schema\.columns/);
  assert.match(checkedQuery, /pg_index/);
  assert.match(checkedQuery, /exchange_pickup_requests_one_active_per_buyer_listing_idx/);
});

test("fails startup with a repair message when required Exchange columns or indexes are missing", async () => {
  await assert.rejects(
    verifyExchangeSchema({
      query: async () => ({
        rows: [{
          missing_columns: ["exchange_listings.seller_id"],
          missing_indexes: ["exchange_pickup_requests.exchange_pickup_requests_listing_idx"],
        }],
      }),
      withRetry,
    }),
    (err) => {
      assert.match(err.message, /Exchange schema is incomplete; refusing to start/);
      assert.match(err.message, /exchange_listings\.seller_id/);
      assert.match(err.message, /exchange_pickup_requests\.exchange_pickup_requests_listing_idx/);
      assert.match(err.message, /Repair the Exchange schema/);
      return true;
    }
  );
});
