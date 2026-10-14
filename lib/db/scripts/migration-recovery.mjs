export const EXCHANGE_MIGRATION_RECOVERY_CHECK = {
  label: "Exchange listings and pickup requests (0159)",
  file: "0159_exchange_local_pickup.sql",
  fatalOnError: true,
  query: `SELECT
    to_regclass('public.exchange_listings') IS NOT NULL
    AND to_regclass('public.exchange_pickup_requests') IS NOT NULL AS exists`,
};

export async function requeueMissingMigrations({ checks, query, withRetry, logger = console }) {
  for (const { label, file, query: checkQuery, fatalOnError = false } of checks) {
    try {
      const { rows } = await withRetry(() => query(checkQuery), `recovery check: ${label}`);
      if (!rows[0].exists) {
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
