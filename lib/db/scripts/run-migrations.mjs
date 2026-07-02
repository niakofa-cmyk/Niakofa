// lib/db/scripts/run-migrations.mjs
//
// Applies every lib/db/migrations/*.sql file, in filename order, directly
// against DATABASE_URL via `pg` — no interactive prompts, safe for CI/
// Railway's non-TTY startCommand.
//
// WHY THIS EXISTS (see CLAUDE.md Incident #28):
// The "migrate" script used to be `drizzle-kit push --config ./drizzle.config.ts`.
// `drizzle-kit push` diffs the live DB against the Drizzle schema and, whenever
// it can't tell an add+drop apart from a rename, opens an interactive prompt —
// which throws `Interactive prompts require a TTY terminal` under Railway's
// non-TTY startCommand. That error was NOT stopping the deploy: the container
// started the API server anyway on whatever schema state already existed,
// every single deploy. This silently broke schema sync for an unknown period —
// confirmed because `help_requests.photo_url` exists in the Drizzle schema
// (lib/db/src/schema/requests.ts) with no corresponding migration file, and
// was missing from the live table, crashing pledge-worker's daily
// reconciliation job on every run with "column \"photo_url\" does not exist".
//
// This repo already has the right building block: every migration file in
// lib/db/migrations/ is hand-written to be idempotent (`ADD COLUMN IF NOT
// EXISTS`, etc. — see CLAUDE.md Incident #2 on why). This script just applies
// them directly instead of asking drizzle-kit to interactively re-derive the
// diff on every boot.
//
// `pnpm --filter @workspace/db run push` / `push-force` (interactive
// drizzle-kit push) are still available for local development, where a real
// TTY exists to answer the rename-vs-add prompt.
//
// FRESH-DB BOOTSTRAP (added July 2026, Replit dev-DB incident):
// If the target database is brand new (no `users` table), this script now
// executes ALL migration files from 0000 onward instead of baseline-marking
// them — the baseline files run cleanly on an empty DB because there is
// nothing for their bare CREATE TABLE / ADD CONSTRAINT statements to collide
// with. It also runs `CREATE EXTENSION IF NOT EXISTS postgis` first, since
// early migrations use geography columns. This is what makes a fresh Replit
// (or any new) Postgres provision-able with a single
// `pnpm --filter @workspace/db run migrate` — no psql loop, no interactive
// drizzle-kit push (which fails with "Interactive prompts require a TTY"
// even against an empty DB when PostGIS objects are in the schema).
//
// For an ALREADY-provisioned DB (users table exists), behavior is unchanged:
// everything through BASELINE_CUTOFF is recorded as applied without being
// executed, and only newer files run.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // Advisory lock: prevents two migrate runs (e.g. parallel service startups)
  // from racing each other. Held on a dedicated session for the entire run.
  // Key is arbitrary but fixed — same value must be used by any other tool
  // that wants to serialize against migrations.
  const MIGRATE_LOCK_KEY = 727501;
  const lockClient = await pool.connect();

  try {
    await lockClient.query(`SELECT pg_advisory_lock($1)`, [MIGRATE_LOCK_KEY]);

    // Early migrations use geography columns — extension must exist first.
    // IF NOT EXISTS makes this a no-op on Railway/prod where it's already on.
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    } catch (err) {
      console.warn(
        "[migrate] could not ensure postgis extension (may lack privileges — continuing):",
        err.message
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations_applied (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    // ── Mode detection ──────────────────────────────────────────────────────
    // Baseline-marking (recording old files as applied WITHOUT executing
    // them) is only correct for a LEGACY pre-existing DB: schema already
    // present (`users` table exists) AND the tracker has never recorded
    // anything (`_migrations_applied` is empty). Two other states must NOT
    // baseline-mark:
    //   1. Brand-new empty DB (no `users` table) — every file must execute.
    //   2. Interrupted fresh bootstrap — a previous run created `users` (in
    //      0000) but died mid-way; the tracker already has rows for the files
    //      that DID run. Baseline-marking here would record the remaining
    //      un-executed baseline files as applied and permanently skip them,
    //      leaving the schema silently incomplete. Instead we just resume:
    //      execute every file the tracker doesn't have.
    const { rows: stateRows } = await pool.query(`
      SELECT
        to_regclass('public.users') IS NOT NULL AS users_exists,
        (SELECT count(*)::int FROM _migrations_applied) AS tracked
    `);
    const { users_exists: usersExists, tracked } = stateRows[0];
    const isFreshDb = !usersExists && tracked === 0;
    const isLegacyDb = usersExists && tracked === 0;
    if (isFreshDb) {
      console.log(
        "[migrate] fresh database detected (no users table, empty tracker) — executing ALL migrations from 0000"
      );
    } else if (!isLegacyDb && tracked > 0 && tracked < 22) {
      // tracker started but doesn't cover the full baseline range — most
      // likely a resumed interrupted bootstrap. Loudly say what we're doing.
      console.log(
        `[migrate] tracker has ${tracked} entries — resuming: executing every un-tracked migration (no baseline-marking)`
      );
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // filenames are zero-padded (0001_..., 0022_...) so lexical sort == order

    // ── Baseline seeding ────────────────────────────────────────────────────
    // 0000-0021 include several raw drizzle-kit-generated files (0000, 0001,
    // 0002, 0003, 0005, 0006 confirmed) with bare `CREATE TABLE` / `ALTER
    // TABLE ... ADD CONSTRAINT` statements and NO `IF NOT EXISTS` guards —
    // Postgres has no native `ADD CONSTRAINT IF NOT EXISTS` syntax, so these
    // can't be made safely idempotent without much riskier surgery. The live
    // production DB already has this exact schema (the app is live and
    // working against it today), so replaying these raw would crash on
    // "relation already exists" — turning a silent migration failure into a
    // hard deploy-blocking one. Instead: everything through this cutoff is
    // recorded as already-applied without executing it. Only files AFTER the
    // cutoff (0022+) actually run. Bump BASELINE_CUTOFF forward over time as
    // old files age out of relevance — never move it backward.
    const BASELINE_CUTOFF = "0021_password_reset_code.sql";

    // Baseline-marking runs ONLY for a legacy pre-existing DB (schema present,
    // tracker empty). Fresh DBs and interrupted bootstraps must execute files
    // instead — see "Mode detection" above. For an up-to-date DB the tracker
    // already contains these rows, so skipping the loop changes nothing.
    if (isLegacyDb) {
      for (const file of files) {
        if (file <= BASELINE_CUTOFF) {
          await pool.query(
            `INSERT INTO _migrations_applied (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
            [file]
          );
        }
      }
    }

    const { rows: appliedRows } = await pool.query(
      `SELECT filename FROM _migrations_applied`
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    let ranCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[migrate] applying ${file}`);

      // Some statements (e.g. ALTER TYPE ... ADD VALUE) cannot run inside a
      // transaction block in PostgreSQL. Files that start with the marker
      // "-- no-transaction" are run without BEGIN/COMMIT.  The tracker INSERT
      // is still a separate auto-committed statement, which is safe: if the
      // migration SQL itself throws, the INSERT never executes and the file
      // will be retried on the next boot.
      const noTransaction = sql.trimStart().startsWith("-- no-transaction");

      const client = await pool.connect();
      try {
        if (noTransaction) {
          await client.query(sql);
          await client.query(
            `INSERT INTO _migrations_applied (filename) VALUES ($1)`,
            [file]
          );
        } else {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query(
            `INSERT INTO _migrations_applied (filename) VALUES ($1)`,
            [file]
          );
          await client.query("COMMIT");
        }
        ranCount++;
      } catch (err) {
        if (!noTransaction) {
          await client.query("ROLLBACK");
        }
        console.error(`[migrate] FAILED on ${file}:`, err);
        throw err; // non-zero exit — startCommand's `&&` must block server start
      } finally {
        client.release();
      }
    }

    console.log(
      ranCount === 0
        ? "[migrate] up to date — no new migrations to apply"
        : `[migrate] applied ${ranCount} migration(s)`
    );
  } finally {
    try {
      await lockClient.query(`SELECT pg_advisory_unlock($1)`, [MIGRATE_LOCK_KEY]);
    } catch {
      // session teardown releases the lock anyway
    }
    lockClient.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] migration run failed:", err);
  process.exit(1);
});
