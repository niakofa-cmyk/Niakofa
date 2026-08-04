/**
 * Niakofa — Conditional Seed
 *
 * Runs the idempotent Fort Worth civic resources seed on every bootstrap.
 * The seed checks each canonical resource by org/state/county, inserts missing
 * rows, and backfills geo fields on existing rows, so partial imports recover
 * without duplicating data.
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

    console.log(
      count > 0
        ? `seed-if-empty: civic_resources has ${count} rows — running idempotent repair seed...`
        : "seed-if-empty: table is empty — running civic seed..."
    );

    // Dynamically import and run the full seed.
    // seed-fort-worth.ts has no default export — it runs itself via
    // top-level side effects on import instead — so we access .default
    // through a typed cast rather than destructuring, since destructuring
    // requires TS to confirm the property exists on the module'''s type.
    const seedModule = (await import("./seed-fort-worth.js")) as { default?: unknown };
    const runSeed = seedModule.default;
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
