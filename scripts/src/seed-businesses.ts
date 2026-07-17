/**
 * Niakofa — Seed Test Businesses
 *
 * Creates a handful of realistic Fort Worth / Tarrant County test businesses
 * (one approved, one pending) so developers can exercise the business-account
 * flow without manually POSTing to the API.
 *
 * Only inserts if the businesses table is empty to remain idempotent.
 *
 * Usage: pnpm --filter @workspace/scripts run seed-businesses
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { businessesTable, businessMembersTable, usersTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

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
      .from(businessesTable);

    if (count > 0) {
      console.log(`seed-businesses: businesses table already has ${count} rows — skipping.`);
      await pool.end();
      return;
    }

    // Find a user to serve as the business owner (first user in DB)
    const [owner] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .limit(1);

    if (!owner) {
      console.log("seed-businesses: no users found — run user seed first, or register a user. Skipping.");
      await pool.end();
      return;
    }

    console.log(`seed-businesses: seeding test businesses (owner: ${owner.name} #${owner.id})…`);

    // ── Approved business ──────────────────────────────────────────────────────
    const [fortWorthCatering] = await db
      .insert(businessesTable)
      .values({
        legal_name: "Fort Worth Community Catering LLC",
        display_name: "FW Community Catering",
        address: "2801 W. Lancaster Ave, Fort Worth, TX 76107",
        phone: "(817) 555-0101",
        approval_status: "approved",
        created_by_user_id: owner.id,
      })
      .returning();

    await db.insert(businessMembersTable).values({
      business_id: fortWorthCatering.id,
      user_id: owner.id,
      role: "owner",
      status: "active",
    });

    // ── Pending business (awaiting admin approval) ─────────────────────────────
    const [tarrantAid] = await db
      .insert(businessesTable)
      .values({
        legal_name: "Tarrant County Mutual Aid Society Inc",
        display_name: "Tarrant Mutual Aid",
        address: "1500 Throckmorton St, Fort Worth, TX 76102",
        phone: "(817) 555-0202",
        approval_status: "pending",
        created_by_user_id: owner.id,
      })
      .returning();

    await db.insert(businessMembersTable).values({
      business_id: tarrantAid.id,
      user_id: owner.id,
      role: "owner",
      status: "active",
    });

    console.log(`seed-businesses: created ${fortWorthCatering.display_name} (approved) and ${tarrantAid.display_name} (pending).`);
    await pool.end();
  } catch (err) {
    console.error("seed-businesses: error", err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
