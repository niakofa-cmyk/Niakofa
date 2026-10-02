import type { Pool } from "pg";

const CIVIC_RESOURCE_SEED_LOCK_NAME = "niakofa:civic-resource-seed";

/**
 * Hold one database-wide lock while a civic-resource seed is checking for
 * existing rows and inserting missing ones. Sequence repair alone is not
 * sufficient if two API bootstraps seed the same database concurrently.
 */
export async function acquireCivicResourceSeedLock(
  pool: Pool,
): Promise<() => Promise<void>> {
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended($1, 0))",
      [CIVIC_RESOURCE_SEED_LOCK_NAME],
    );
  } catch (error) {
    client.release();
    throw error;
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [CIVIC_RESOURCE_SEED_LOCK_NAME],
      );
    } finally {
      client.release();
    }
  };
}