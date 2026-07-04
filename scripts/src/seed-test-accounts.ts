/**
 * Niakofa — Seed Test Accounts
 *
 * Creates (or repairs) the three standing test accounts against whichever
 * database DATABASE_URL points to. Upserts by email, so it is safe to run
 * more than once — existing rows get their password, role flags, and
 * suspension state corrected rather than erroring on a duplicate-email
 * constraint.
 *
 * WHY THIS IS A MANUAL SCRIPT
 * ──────────────────────────────────────────────────────────────────────────
 * This is intentionally NOT wired into railpack.json's automatic deploy
 * startCommand. Seeding known admin credentials on every production boot
 * would be a standing security hole. Run it once, by hand:
 *
 *   # Local Replit dev DB:
 *   pnpm --filter @workspace/scripts run seed-test-accounts
 *
 *   # Railway production DB (from outside Railway's private network):
 *   DATABASE_URL="postgres://..." pnpm --filter @workspace/scripts run seed-test-accounts
 *
 * Get the Railway Postgres connection string from:
 *   Railway → your project → Postgres → Variables → DATABASE_PUBLIC_URL
 *
 * WHAT IT DOES
 * ──────────────────────────────────────────────────────────────────────────
 * - Admin  admin@niakofa.app   / NiakofaAdmin2026!   — is_admin=true
 * - Helper helper@niakofa.app  / NiakofaHelper2026!  — is_helper=true, approved, full profile
 * - User   user@niakofa.app    / NiakofaUser2026!    — standard approved user
 *
 * On re-run: resets password hash, clears suspensions, resets token_version
 * (forces re-login), and applies any missing profile fields.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// ── Database connection ──────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "\nERROR: DATABASE_URL is not set.\n" +
    "  For Replit dev:  the env var should be set automatically.\n" +
    "  For Railway:     DATABASE_URL=\"postgres://...\" pnpm --filter @workspace/scripts run seed-test-accounts\n" +
    "                   (use DATABASE_PUBLIC_URL from Railway → Postgres → Variables)\n"
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// ── Account definitions ───────────────────────────────────────────────────────
// Each account has separate `insertFields` (first-time creation) and
// `repairFields` (repair run for existing rows). The repair set explicitly
// includes is_suspended:false and token_version:0 so a previously-suspended
// or force-logged-out account is fully restored to a working state.

interface AccountDef {
  role: string;
  email: string;
  password: string;
  insertFields: Omit<typeof usersTable.$inferInsert, "email" | "password_hash">;
  /** Same column set as insertFields but subset-only — applied in the UPDATE
   *  path. Typed as insert-compatible so drizzle's .set() accepts it without
   *  a broad cast that would permit invalid column names. */
  repairFields: Partial<Omit<typeof usersTable.$inferInsert, "email">>;
}

// bcrypt cost factor 12 — matches the real register and reset-password routes
// so these hashed passwords authenticate through the normal login flow.
const BCRYPT_ROUNDS = 12;

const ACCOUNTS: AccountDef[] = [
  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    role: "admin",
    email: "admin@niakofa.app",
    password: "NiakofaAdmin2026!",
    insertFields: {
      name: "Admin Test Account",
      account_type: "individual",
      is_admin: true,
      is_suspended: false,
      approval_status: "approved",
    },
    repairFields: {
      account_type: "individual",
      is_admin: true,
      is_suspended: false,
      approval_status: "approved",
      // Reset token_version so any force-logout is cleared and the
      // freshly-hashed password works immediately.
      token_version: 0,
    },
  },

  // ── Helper ─────────────────────────────────────────────────────────────────
  // Gets a full profile so all helper-mode flows are testable end-to-end:
  // dispatch suggestion, navigation, review/rating, background-check status, etc.
  {
    role: "helper",
    email: "helper@niakofa.app",
    password: "NiakofaHelper2026!",
    insertFields: {
      name: "Helper Test Account",
      account_type: "individual",
      is_helper: true,
      helper_status: "approved",
      approval_status: "approved",
      is_suspended: false,
      // Identity & background — mark verified so identity-gated flows work.
      // background_check_status canonical values: not_started | pending | passed | failed
      // API trust-gating checks for exact "passed" — "clear" is not canonical.
      identity_verified: true,
      identity_verification_status: "verified",
      background_check_status: "passed",
      // Helper profile — populated so profile page, matching engine, and
      // dispatch-suggest all behave as if this is an active volunteer
      helper_bio: "Test helper account — safe to delete. Here to support the community.",
      helper_languages: ["en"],
      helper_skills: ["general", "transportation", "groceries", "errands"],
      helper_vehicle: "personal vehicle",
      // Trust / goodwill — start at reasonable values so leaderboard and
      // trust-score gates don't block testing
      trust_score: 4.8,
      goodwill_score: 50,
      help_count: 10,
    },
    repairFields: {
      account_type: "individual",
      is_helper: true,
      helper_status: "approved",
      approval_status: "approved",
      is_suspended: false,
      identity_verified: true,
      identity_verification_status: "verified",
      background_check_status: "passed",
      helper_bio: "Test helper account — safe to delete. Here to support the community.",
      helper_languages: ["en"],
      helper_skills: ["general", "transportation", "groceries", "errands"],
      helper_vehicle: "personal vehicle",
      trust_score: 4.8,
      goodwill_score: 50,
      help_count: 10,
      token_version: 0,
    },
  },

  // ── Regular user ───────────────────────────────────────────────────────────
  {
    role: "user",
    email: "user@niakofa.app",
    password: "NiakofaUser2026!",
    insertFields: {
      name: "User Test Account",
      account_type: "individual",
      is_suspended: false,
      approval_status: "approved",
    },
    repairFields: {
      account_type: "individual",
      is_suspended: false,
      approval_status: "approved",
      token_version: 0,
    },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n▶ seed-test-accounts — connecting to database…");

  // Smoke-test: make sure the users table exists before we do real work.
  // If migrations haven't been applied, fail early with a clear message.
  try {
    await pool.query("SELECT 1 FROM users LIMIT 1");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) {
      console.error(
        "\nERROR: The `users` table does not exist on this database.\n" +
        "  Make sure all migrations have been applied first:\n" +
        "    DATABASE_URL=\"...\" pnpm --filter @workspace/api-server run migrate\n"
      );
    } else {
      console.error("\nERROR connecting to database:", msg);
    }
    await pool.end().catch(() => {});
    process.exit(1);
  }

  for (const acct of ACCOUNTS) {
    const normalizedEmail = acct.email.trim().toLowerCase();

    // Hash BEFORE the select so we don't hold the DB connection open during
    // the expensive bcrypt operation.
    const password_hash = await bcrypt.hash(acct.password, BCRYPT_ROUNDS);

    const [existing] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${normalizedEmail}`)
      .limit(1);

    if (existing) {
      // ── Repair existing account ─────────────────────────────────────────
      // repairFields is typed as Partial<Omit<$inferInsert, "email">> so every
      // key is a valid column. The cast to Partial<$inferInsert> is intentional
      // and sound — it narrows the broader Partial back to the shape drizzle's
      // .set() expects without permitting arbitrary string keys.
      const updatePayload: Partial<typeof usersTable.$inferInsert> = {
        password_hash,
        ...acct.repairFields,
      };
      await db
        .update(usersTable)
        .set(updatePayload)
        .where(eq(usersTable.id, existing.id));
      console.log(`  ✔ repaired  ${acct.role.padEnd(6)} ${acct.email}  (id ${existing.id})`);
    } else {
      // ── Create new account ──────────────────────────────────────────────
      const insertPayload: typeof usersTable.$inferInsert = {
        email: normalizedEmail,
        password_hash,
        ...acct.insertFields,
      };
      const [created] = await db
        .insert(usersTable)
        .values(insertPayload)
        .returning({ id: usersTable.id });
      console.log(`  ✔ created   ${acct.role.padEnd(6)} ${acct.email}  (id ${created.id})`);
    }
  }

  console.log("\n✅ All three test accounts are ready.\n");
  console.log("  Role    Email                    Password");
  console.log("  ──────  ───────────────────────  ─────────────────────");
  console.log("  Admin   admin@niakofa.app         NiakofaAdmin2026!");
  console.log("  Helper  helper@niakofa.app        NiakofaHelper2026!");
  console.log("  User    user@niakofa.app           NiakofaUser2026!\n");
  console.log("  ℹ  Admin account:  /admin panel, Nia kill-switch, all management tabs.");
  console.log("  ℹ  Helper account: helper mode, dispatch, navigation, rating flows.");
  console.log("  ℹ  User account:   standard requester flow end-to-end.\n");

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n✗ seed-test-accounts failed:", err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  process.exit(1);
});
