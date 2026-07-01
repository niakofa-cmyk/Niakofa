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
// CAVEAT: this script assumes an already-provisioned DB matching the
// BASELINE_CUTOFF schema state (see below) — it does NOT bootstrap a brand
// new empty database, since baseline files are marked applied without being
// executed. To provision a fresh DB from zero, use the interactive
// `push`/`push-force` script instead (against an empty database, drizzle-kit
// push will create everything from the current schema in one pass, no
// rename-ambiguity prompt possible since there's nothing to diff against).

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

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations_applied (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT NOW()
      )
    `);

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

    for (const file of files) {
      if (file <= BASELINE_CUTOFF) {
        await pool.query(
          `INSERT INTO _migrations_applied (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
          [file]
        );
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

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO _migrations_applied (filename) VALUES ($1)`,
          [file]
        );
        await client.query("COMMIT");
        ranCount++;
      } catch (err) {
        await client.query("ROLLBACK");
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
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] migration run failed:", err);
  process.exit(1);
});
