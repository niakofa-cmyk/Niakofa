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

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`[migrate] migrations directory not found: ${MIGRATIONS_DIR}`);
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Prevent unhandled pool-level errors from crashing the process.
  // Railway can terminate idle connections; without this listener the
  // default EventEmitter behavior throws and kills the migration run.
  pool.on("error", (err) => {
    console.warn("[migrate] pg pool error (non-fatal):", err.message);
  });

  // Retry wrapper for transient connection errors — Railway PG can drop
  // connections during deploys. Only retries on connection-level errors,
  // not on SQL logic errors.
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2_000;
  async function withRetry(fn, label = "query") {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const code = err.code || "";
        const isTransient =
          code === "ECONNRESET" ||
          code === "ECONNREFUSED" ||
          code === "ETIMEDOUT" ||
          code === "57P01" || // admin_shutdown
          code === "57P02" || // crash_shutdown
          code === "08006" || // connection_failure
          code === "08001" || // sqlclient_unable_to_establish_sqlconnection
          code === "08004" || // sqlserver_rejected_establishment_of_sqlconnection
          err.message?.includes("Connection terminated") ||
          err.message?.includes("connection refused") ||
          err.message?.includes("TCP");
        if (!isTransient || attempt === MAX_RETRIES) throw err;
        console.warn(`[migrate] ${label}: transient error (code=${code}), retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    throw lastErr;
  }

  // Advisory lock: prevents two migrate runs (e.g. parallel service startups)
  // from racing each other. Held on a dedicated session for the entire run.
  // Key is arbitrary but fixed — same value must be used by any other tool
  // that wants to serialize against migrations.
  const MIGRATE_LOCK_KEY = 727501;
  const lockClient = await withRetry(() => pool.connect(), "advisory lock");

  try {
    await withRetry(() => lockClient.query(`SELECT pg_advisory_lock($1)`, [MIGRATE_LOCK_KEY]), "advisory lock");

    // Check if PostGIS is available before attempting CREATE EXTENSION.
    // Sending CREATE EXTENSION to a server without PostGIS causes a
    // PostgreSQL server-side ERROR log (PID-level) even when the Node.js
    // client catches it — making Railway logs look broken. We pre-check
    // pg_available_extensions (which never throws) and only issue the
    // command when the extension is actually installable.
    {
      const { rows: availRows } = await withRetry(
        () => pool.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'postgis' LIMIT 1`),
        "postgis check"
      );
      if (availRows.length > 0) {
        await withRetry(() => pool.query(`CREATE EXTENSION IF NOT EXISTS postgis`), "postgis create");
        console.log("[migrate] postgis extension ensured");
      } else {
        console.log(
          "[migrate] postgis not available on this server — skipping (Haversine fallback active)"
        );
      }
    }

    await withRetry(
      () => pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations_applied (
          filename    text PRIMARY KEY,
          applied_at  timestamptz NOT NULL DEFAULT NOW()
        )
      `),
      "create _migrations_applied"
    );

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
    const { rows: stateRows } = await withRetry(
      () => pool.query(`
        SELECT
          to_regclass('public.users') IS NOT NULL AS users_exists,
          (SELECT count(*)::int FROM _migrations_applied) AS tracked
      `),
      "mode detection"
    );
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

    // ── Recovery: un-mark baseline files whose effect isn't actually present ──
    // A prior deploy baseline-marked files through an older cutoff without
    // executing them, but some of those files' CREATE TABLE / ADD COLUMN never
    // actually ran on this DB (e.g. system_settings from 0018 is missing even
    // though "0018_system_settings.sql" is recorded as applied). Every file
    // below is written idempotently (IF NOT EXISTS / guarded DO blocks), so
    // it's always safe to re-run — delete its tracker row and let the normal
    // apply loop below pick it back up.
    // Recovery checks use to_regclass() / to_regtype() / information_schema —
    // all of which return NULL instead of throwing when the object doesn't
    // exist yet. This makes the checks safe on a fresh DB where the enum,
    // table, or column hasn't been created yet (no ::regtype hard cast that
    // would throw "does not exist" before migrations have run).
    const RECOVERY_CHECKS = [
      {
        label: "system_settings",
        file: "0018_system_settings.sql",
        query: `SELECT to_regclass('public.system_settings') IS NOT NULL AS exists`,
      },
      {
        label: "report_type 'sos' enum value",
        file: "0019_report_type_sos.sql",
        // to_regtype() returns NULL (not throw) when type doesn't exist
        query: `SELECT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'report_type' AND e.enumlabel = 'sos'
        ) AS exists`,
      },
      {
        label: "help_requests_requester_id_fk constraint",
        file: "0020_core_foreign_keys.sql",
        // to_regclass() returns NULL when table doesn't exist — safe on fresh DB
        query: `SELECT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          WHERE c.conname = 'help_requests_requester_id_fk' AND cl.relname = 'help_requests'
        ) AS exists`,
      },
      {
        label: "users.password_reset_code column",
        file: "0021_password_reset_code.sql",
        query: `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'password_reset_code'
        ) AS exists`,
      },
      // ── Legacy Engine migration chain (0092/0093) ───────────────────────────
      // 0092 created Legacy Engine tables with uuid PKs. 0093 dropped them and
      // recreated with serial integer PKs to match the Drizzle ORM schema.
      // On a live DB that had 0093 baseline-marked (or partially applied due to
      // an earlier crash), family_knowledge_versions may still be the uuid
      // version (or absent), causing every Drizzle query against it to 500.
      // We detect this by checking whether the id column is an integer type —
      // the uuid version has 'uuid', the correct version has 'integer'.
      {
        label: "family_knowledge_versions with integer PK (0093 serial integer fix)",
        file: "0093_legacy_engine_schema_reconcile.sql",
        query: `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'family_knowledge_versions'
            AND column_name = 'id'
            AND data_type = 'integer'
        ) AS exists`,
      },
      // legacy_worlds is also created in 0093 with a serial integer PK.
      // If 0093 was never fully executed, this table won't exist.
      {
        label: "legacy_worlds table (0093 integer PK recreation)",
        file: "0093_legacy_engine_schema_reconcile.sql",
        query: `SELECT to_regclass('public.legacy_worlds') IS NOT NULL AS exists`,
      },
      // family_places and family_events are created in 0093 with integer PKs
      // that downstream migrations (0096, 0102) reference via FK. Missing these
      // breaks the entire 0096+ chain.
      {
        label: "family_places table (0093 integer PK recreation)",
        file: "0093_legacy_engine_schema_reconcile.sql",
        query: `SELECT to_regclass('public.family_places') IS NOT NULL AS exists`,
      },
      {
        label: "family_events table (0093 integer PK recreation)",
        file: "0093_legacy_engine_schema_reconcile.sql",
        query: `SELECT to_regclass('public.family_events') IS NOT NULL AS exists`,
      },
      // ── Phase 5 tables (0102) ───────────────────────────────────────────────
      // 0102 creates legacy_scenes, legacy_dialogues, legacy_choices,
      // legacy_world_versions, legacy_collectibles, legacy_skills and adds RLS.
      // These were dropped in 0093 and never recreated until 0102.
      {
        label: "legacy_scenes table (Phase 5 — 0102)",
        file: "0102_legacy_phase5_missing_tables_and_rls.sql",
        query: `SELECT to_regclass('public.legacy_scenes') IS NOT NULL AS exists`,
      },
      // ── Persistent quests (0103) ────────────────────────────────────────────
      // 0103 creates legacy_quests with a serial integer PK and a unique index
      // on (family_id, quest_id_text, fingerprint). If this was baseline-marked
      // without executing, every quest persistence write will 500.
      {
        label: "legacy_quests table (persistent storage — 0103)",
        file: "0103_legacy_quests_persistent.sql",
        query: `SELECT to_regclass('public.legacy_quests') IS NOT NULL AS exists`,
      },
      // ── Performance indexes (0104) ──────────────────────────────────────────
      // 0104 was originally committed to artifacts/api-server/migrations/ —
      // a path that run-migrations.mjs never scans — so these indexes were
      // never applied to the Railway DB. Moved to lib/db/migrations/ as 0104.
      // Check: idx_legacy_memory_mysteries_family_status is the sentinel.
      {
        label: "idx_legacy_memory_mysteries_family_status index (0104 performance indexes)",
        file: "0104_legacy_indexes.sql",
        query: `SELECT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'idx_legacy_memory_mysteries_family_status'
        ) AS exists`,
      },

       // -- family_members columns (0094, 0095) --
       // 0094 adds is_living BOOLEAN to family_members. Legacy character routes
       // and completeness scoring reference this column -- if absent, those
       // routes return 500 on every call.
       {
         label: "family_members.is_living column (0094)",
         file: "0094_family_members_is_living.sql",
         query: `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'family_members' AND column_name = 'is_living'
         ) AS exists`,
       },
       // 0095 adds updated_at TIMESTAMPTZ to family_members. The knowledge-
       // version fingerprint includes family_members.updated_at -- if absent,
       // the content-hash fingerprint silently drops this dimension.
       {
         label: "family_members.updated_at column (0095)",
         file: "0095_family_members_updated_at.sql",
         query: `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'family_members' AND column_name = 'updated_at'
         ) AS exists`,
       },
       // -- legacy_place_discoveries table (0096) --
       // 0096 creates legacy_place_discoveries. The GPS check-in route in
       // legacy-map.ts writes to this table -- missing it crashes every check-in.
       {
         label: "legacy_place_discoveries table (0096)",
         file: "0096_legacy_place_discoveries.sql",
         query: `SELECT to_regclass('public.legacy_place_discoveries') IS NOT NULL AS exists`,
       },
       // -- legacy_seasonal_events / game_master_narrations / world_evolution_log (0098) --
       // 0098 creates three critical Phase 5 tables. If baseline-marked without
       // executing, seasonal-events, game-master, and world-evolution routes all 500.
       {
         label: "legacy_seasonal_events table (0098)",
         file: "0098_legacy_phase5_living_universe.sql",
         query: `SELECT to_regclass('public.legacy_seasonal_events') IS NOT NULL AS exists`,
       },
       {
         label: "legacy_game_master_narrations table (0098)",
         file: "0098_legacy_phase5_living_universe.sql",
         query: `SELECT to_regclass('public.legacy_game_master_narrations') IS NOT NULL AS exists`,
       },
       {
         label: "legacy_world_evolution_log table (0098)",
         file: "0098_legacy_phase5_living_universe.sql",
         query: `SELECT to_regclass('public.legacy_world_evolution_log') IS NOT NULL AS exists`,
       },
       // -- legacy_family_challenges / legacy_challenge_contributions (0099) --
       // 0097 created a draft schema; 0099 drops it and recreates with the real
       // schema (correct FK types, contribution tracking). The challenges routes
       // use the 0099 schema -- if 0099 was baseline-marked without executing,
       // the table may have the wrong schema or be absent entirely.
       {
         label: "legacy_family_challenges table (0099 real schema)",
         file: "0099_legacy_family_challenges_real.sql",
         query: `SELECT to_regclass('public.legacy_family_challenges') IS NOT NULL AS exists`,
       },
       {
         label: "legacy_challenge_contributions table (0099)",
         file: "0099_legacy_family_challenges_real.sql",
         query: `SELECT to_regclass('public.legacy_challenge_contributions') IS NOT NULL AS exists`,
       },
       // -- legacy_quest_progress table (0100) --
       // 0100 creates legacy_quest_progress for per-user XP and chapter-scene
       // progress tracking. If absent, the progress-saving endpoint crashes.
       {
         label: "legacy_quest_progress table (0100)",
         file: "0100_legacy_quest_progress.sql",
         query: `SELECT to_regclass('public.legacy_quest_progress') IS NOT NULL AS exists`,
       },
       // -- legacy_memory_mysteries / legacy_ai_director_missions / legacy_character_evolution (0101) --
       // 0101 creates the three Phase 5 "intelligence" tables. If baseline-
       // marked without executing, the AI Director, Memory Mysteries, and
       // Character Evolution routes all fail at runtime with "relation does
       // not exist".
       {
         label: "legacy_memory_mysteries table (0101)",
         file: "0101_legacy_phase5_enhancements.sql",
         query: `SELECT to_regclass('public.legacy_memory_mysteries') IS NOT NULL AS exists`,
       },
       {
         label: "legacy_ai_director_missions table (0101)",
         file: "0101_legacy_phase5_enhancements.sql",
         query: `SELECT to_regclass('public.legacy_ai_director_missions') IS NOT NULL AS exists`,
       },
       {
         label: "legacy_character_evolution table (0101)",
         file: "0101_legacy_phase5_enhancements.sql",
         query: `SELECT to_regclass('public.legacy_character_evolution') IS NOT NULL AS exists`,
       },
    ];
    // Only run recovery checks when the DB already has a users table —
    // on a truly fresh DB there's nothing to recover, and the checks are
    // guaranteed to return false (which would needlessly de-mark rows that
    // don't exist). isFreshDb path skips this entire block.
    if (!isFreshDb) {
      for (const { label, file, query } of RECOVERY_CHECKS) {
        try {
          const { rows } = await withRetry(() => pool.query(query), `recovery check: ${label}`);
          if (!rows[0].exists) {
            const { rowCount } = await withRetry(
              () => pool.query(`DELETE FROM _migrations_applied WHERE filename = $1`, [file]),
              `recovery delete: ${file}`
            );
            if (rowCount > 0) {
              console.log(`[migrate] recovery: "${label}" missing but "${file}" was marked applied — re-queuing it`);
            }
          }
        } catch (checkErr) {
          // A check failure is non-fatal — log and skip. The migration file
          // will stay in its current state (applied or not).
          console.warn(`[migrate] recovery check skipped for "${file}":`, checkErr.message);
        }
      }
    }

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
    // cutoff (0018+) actually run. Bump BASELINE_CUTOFF forward over time as
    // old files age out of relevance — never move it backward. (Moved back
    // from 0021 to 0017: 0018-0021 are all idempotent and 0018 turned out to
    // not actually be applied on the live DB despite being baseline-marked —
    // see the recovery block above.)
    const BASELINE_CUTOFF = "0017_preferred_language.sql";

    // Baseline-marking runs ONLY for a legacy pre-existing DB (schema present,
    // tracker empty). Fresh DBs and interrupted bootstraps must execute files
    // instead — see "Mode detection" above. For an up-to-date DB the tracker
    // already contains these rows, so skipping the loop changes nothing.
    if (isLegacyDb) {
      for (const file of files) {
        if (file <= BASELINE_CUTOFF) {
          await withRetry(
            () => pool.query(`INSERT INTO _migrations_applied (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`, [file]),
            `baseline seed: ${file}`
          );
        }
      }
    }

    const { rows: appliedRows } = await withRetry(
      () => pool.query(`SELECT filename FROM _migrations_applied`),
      "fetch applied list"
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

      const client = await withRetry(() => pool.connect(), `connect: ${file}`);
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
