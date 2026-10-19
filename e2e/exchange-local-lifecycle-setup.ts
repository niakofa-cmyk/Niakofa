import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Pool as PgPool } from "pg";

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const cleanupLockName = "niakofa:exchange-local-lifecycle:e2e";
const fixtureEmailPatterns = [
  "^exchange-focus-[a-p]{8}-[a-p]{4}-[a-p]{4}-[a-p]{4}-[a-p]{12}-(owner|buyer)@example[.]invalid$",
  "^exchange-[a-p]{8}-[a-p]{4}-[a-p]{4}-[a-p]{4}-[a-p]{12}-(owner|buyer|outsider)@example[.]invalid$",
];
const fixtureRunIdFromEmails = [
  /^exchange-focus-([a-p]{8}-[a-p]{4}-[a-p]{4}-[a-p]{4}-[a-p]{12})-(?:owner|buyer)@example\.invalid$/,
  /^exchange-([a-p]{8}-[a-p]{4}-[a-p]{4}-[a-p]{4}-[a-p]{12})-(?:owner|buyer|outsider)@example\.invalid$/,
];

function requireLocalTargets(): void {
  const baseURL = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "";
  const databaseURL = process.env.DATABASE_URL ?? "";
  if (!baseURL || !databaseURL) {
    throw new Error("Local Exchange cleanup requires a local preview and database.");
  }

  const previewHost = new URL(baseURL).hostname.replace(/^\[|\]$/g, "");
  const databaseHost = new URL(databaseURL).hostname.replace(/^\[|\]$/g, "");
  if (!localHosts.has(previewHost) || !localHosts.has(databaseHost)) {
    throw new Error("Refusing Exchange fixture cleanup for a non-local preview or database.");
  }
}

async function removeInterruptedFixtures(client: {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<void> {
  await client.query("BEGIN");
  try {
    const users = await client.query(
      `SELECT id, email FROM users
       WHERE is_disposable_test_account = true
         AND (email ~ $1 OR email ~ $2)`,
      fixtureEmailPatterns,
    );
    const userIds = users.rows.map((row) => Number(row.id));
    const runIds = [...new Set(users.rows.flatMap((row) => {
      for (const pattern of fixtureRunIdFromEmails) {
        const match = pattern.exec(String(row.email));
        if (match) return [match[1]];
      }
      return [];
    }))];
    const listingTitles = runIds.flatMap((runId) => [
      `Focused pickup ${runId}`,
      `Focused withdraw ${runId}`,
    ]);
    const listingTitlePatterns = runIds.map((runId) => `%${runId}%`);

    const listings = await client.query(
      `SELECT id FROM exchange_listings
       WHERE seller_id = ANY($1::int[])
          OR title = ANY($2::text[])
          OR title LIKE ANY($3::text[])`,
      [userIds, listingTitles, listingTitlePatterns],
    );
    const listingIds = listings.rows.map((row) => Number(row.id));
    const pickups = await client.query(
      `SELECT id FROM exchange_pickup_requests
       WHERE listing_id = ANY($1::int[]) OR buyer_id = ANY($2::int[])`,
      [listingIds, userIds],
    );
    const pickupIds = pickups.rows.map((row) => Number(row.id));

    if (pickupIds.length) {
      await client.query(
        "DELETE FROM exchange_pickup_disputes WHERE pickup_request_id = ANY($1::int[])",
        [pickupIds],
      );
    }
    if (listingIds.length || userIds.length) {
      await client.query(
        `DELETE FROM exchange_moderation_review_history
         WHERE listing_id = ANY($1::int[])
            OR report_id IN (
              SELECT id FROM reports
              WHERE reporter_id = ANY($2::int[])
                 OR reported_user_id = ANY($2::int[])
                 OR reported_exchange_listing_id = ANY($1::int[])
            )`,
        [listingIds, userIds],
      );
      await client.query(
        `DELETE FROM reports
         WHERE reporter_id = ANY($1::int[]) OR reported_user_id = ANY($1::int[])
            OR reported_exchange_listing_id = ANY($2::int[])`,
        [userIds, listingIds],
      );
      await client.query(
        `DELETE FROM message_notifications
         WHERE user_id = ANY($1::int[])
            OR metadata->>'exchange_listing_id' = ANY($2::text[])`,
        [userIds, listingIds.map(String)],
      );
    }
    if (pickupIds.length) {
      await client.query("DELETE FROM exchange_pickup_requests WHERE id = ANY($1::int[])", [pickupIds]);
    }
    if (listingIds.length) {
      await client.query("DELETE FROM exchange_listings WHERE id = ANY($1::int[])", [listingIds]);
    }
    if (userIds.length) {
      await client.query("DELETE FROM users WHERE id = ANY($1::int[])", [userIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export default async function exchangeLocalLifecycleSetup(): Promise<(() => Promise<void>) | void> {
  if (process.env.RUN_EXCHANGE_LOCAL_E2E !== "1") return;
  requireLocalTargets();

  const dbRequire = createRequire(resolve(process.cwd(), "lib/db/package.json"));
  const { Pool } = dbRequire("pg") as { Pool: typeof PgPool };
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const lock = await pool.connect();
  let lockHeld = false;

  try {
    await lock.query("SELECT pg_advisory_lock(hashtext($1))", [cleanupLockName]);
    lockHeld = true;
    // Playwright can terminate a timed-out worker before its test-level finally
    // runs. Sweep only this suite's synthetic disposable accounts before reuse.
    const cleanup = await pool.connect();
    try {
      await removeInterruptedFixtures(cleanup);
    } finally {
      cleanup.release();
    }
  } catch (error) {
    if (lockHeld) {
      await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [cleanupLockName]).catch(() => undefined);
    }
    lock.release();
    await pool.end();
    throw error;
  }

  return async () => {
    try {
      const cleanup = await pool.connect();
      try {
        await removeInterruptedFixtures(cleanup);
      } finally {
        cleanup.release();
      }
    } finally {
      await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [cleanupLockName]).catch(() => undefined);
      lock.release();
      await pool.end();
    }
  };
}
