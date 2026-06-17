/**
 * Niakofa — Conditional Seed
 *
 * Runs the Fort Worth civic resources seed ONLY if the civic_resources table
 * is empty. This prevents Railway from wiping and re-seeding on every deploy
 * while still seeding on first startup.
 *
 * Usage: pnpm --filter @workspace/scripts run seed-if-empty
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { civicResourcesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

async function main() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(civicResourcesTable);

    if (count > 0) {
      console.log(`seed-if-empty: civic_resources already has ${count} rows — skipping seed.`);
      await pool.end();
      return;
    }

    console.log("seed-if-empty: table is empty — running civic seed...");

    // Dynamically import and run the full seed
    const mod = await import("./seed-fort-worth.js") as { default?: () => Promise<void> }; const runSeed = mod.default;
    if (typeof runSeed === "function") {
      await runSeed();
    } else {
      // seed-fort-worth.ts runs itself at import time
      console.log("seed-if-empty: seed ran via side-effects on import");
    }

    console.log("seed-if-empty: done.");
    await pool.end();
  } catch (err) {
    console.error("seed-if-empty: error", err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
