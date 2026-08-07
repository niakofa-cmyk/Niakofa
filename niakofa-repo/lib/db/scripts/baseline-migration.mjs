// One-time script: marks the baseline migration (0000_*.sql) as already
// applied, WITHOUT re-running its SQL — because the tables it describes
// already exist in this database (created via drizzle-kit push, which
// doesn't write migration history).
//
// Safe to run multiple times (idempotent — checks before inserting).
// Does NOT touch any application table. Only creates/writes to
// drizzle.__drizzle_migrations, which is drizzle-kit's own tracking table.
import pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "migrations");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  for (const entry of journal.entries) {
    const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`);
    const sqlContent = fs.readFileSync(sqlPath, "utf8");
    const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

    const existing = await pool.query(
      `SELECT id FROM "drizzle"."__drizzle_migrations" WHERE hash = $1`,
      [hash]
    );

    if (existing.rows.length > 0) {
      console.log(`Already marked applied: ${entry.tag}`);
      continue;
    }

    await pool.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when]
    );
    console.log(`Marked as applied (baseline, no SQL executed): ${entry.tag}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
