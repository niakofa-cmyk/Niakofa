/**
 * Niakofa — Seed Test Accounts (enhanced)
 *
 * Creates (or repairs) the three standing test accounts against whichever
 * database DATABASE_URL points to. By default all three are selected; pass
 * `--only admin|helper|user` to limit both password requirements and database
 * writes to one selected account. Upserts by email, so a selected existing row
 * gets its password and role fields repaired rather than erroring on a
 * duplicate-email constraint.
 *
 * WHY THIS IS A MANUAL SCRIPT (unchanged from the original)
 * ──────────────────────────────────────────────────────────────────────────
 * This is intentionally NOT wired into railpack.json's automatic deploy
 * startCommand. Seeding known admin credentials on every production boot
 * would be a standing security hole. Run it once, by hand.
 *
 * WHAT'S NEW IN THIS VERSION
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Passwords are read from environment variables (SEED_ADMIN_PASSWORD,
 *    SEED_HELPER_PASSWORD, SEED_USER_PASSWORD). Every database target must
 *    receive explicitly supplied values; this script never contains a
 *    built-in password fallback.
 * 2. A production guard: if DATABASE_URL doesn't look like a local/dev
 *    database, the script refuses to run unless you pass
 *    `--i-know-this-is-production` on the command line. This is the one
 *    guardrail that matters most here — seeding a fixed, published admin
 *    password into a live app is hard to undo if it's forgotten and
 *    someone else finds the credentials later.
 * 3. Prints a reminder to rotate the admin password after first login.
 * 4. `--only <role>` creates or repairs just one account; all unselected
 *    fixtures are left untouched. If the selected account already exists,
 *    its password and configured role/status fields are still repaired.
 *
 * USAGE
 * ──────────────────────────────────────────────────────────────────────────
 *   # Local Replit / dev DB:
 *   SEED_ADMIN_PASSWORD="<your own strong password>" \
 *   SEED_HELPER_PASSWORD="<your own strong password>" \
 *   SEED_USER_PASSWORD="<your own strong password>" \
 *   pnpm --filter @workspace/scripts run seed-test-accounts
 *
 *   # Seed only the admin fixture locally; helper/user are not touched:
 *   SEED_ADMIN_PASSWORD="<your own strong password>" \
 *   pnpm --filter @workspace/scripts run seed-test-accounts -- --only admin
 *
 *   # Railway / any production DB — supply passwords AND pass the flag:
 *   DATABASE_URL="postgres://..." \
 *   SEED_ADMIN_PASSWORD="<your own strong password>" \
 *   SEED_HELPER_PASSWORD="<your own strong password>" \
 *   SEED_USER_PASSWORD="<your own strong password>" \
 *   pnpm --filter @workspace/scripts run seed-test-accounts -- --i-know-this-is-production
 *
 *   # Railway / production — seed or repair just the admin fixture:
 *   DATABASE_URL="postgres://..." \
 *   SEED_ADMIN_PASSWORD="<your own strong password>" \
 *   pnpm --filter @workspace/scripts run seed-test-accounts -- --only admin --i-know-this-is-production
 *
 * Get the Railway Postgres connection string from:
 *   Railway → your project → Postgres → Variables → DATABASE_PUBLIC_URL
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import { usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const ACCOUNT_ROLES = ["admin", "helper", "user"] as const;
type AccountRole = (typeof ACCOUNT_ROLES)[number];

function parseOnlyRole(args: string[]): AccountRole | undefined {
  let selectorSeen = false;
  let selectedRole: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg !== "--only" && !arg.startsWith("--only=")) continue;

    if (selectorSeen) {
      console.error("ERROR: pass --only at most once.");
      process.exit(1);
    }
    selectorSeen = true;

    if (arg === "--only") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        console.error("ERROR: --only requires one role: admin, helper, or user.");
        process.exit(1);
      }
      selectedRole = value;
      i += 1;
    } else {
      selectedRole = arg.slice("--only=".length);
    }
  }

  if (!selectorSeen) return undefined;
  if (!ACCOUNT_ROLES.includes(selectedRole as AccountRole)) {
    console.error("ERROR: --only expects one role: admin, helper, or user.");
    process.exit(1);
  }
  return selectedRole as AccountRole;
}

const onlyRole = parseOnlyRole(process.argv.slice(2));

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

// ── Production safety guard ──────────────────────────────────────────────────
// Local/dev connection strings almost always point at localhost, 127.0.0.1,
// or a Replit-internal host. Anything else is treated as "probably
// production" and requires an explicit, hard-to-typo-accidentally flag.
const looksLocal = /localhost|127\.0\.0\.1|replit/i.test(DATABASE_URL);
const hasProdFlag = process.argv.includes("--i-know-this-is-production");

if (!looksLocal && !hasProdFlag) {
  console.error(
    "\nERROR: DATABASE_URL does not look like a local/dev database, and you\n" +
    "haven't confirmed this is intentional.\n\n" +
    "If this really is your production database and you mean to seed or\n" +
    "repair these accounts on it, re-run with:\n\n" +
    "    ... pnpm --filter @workspace/scripts run seed-test-accounts -- --i-know-this-is-production\n\n" +
    "Before doing that: set a unique SEED_*_PASSWORD for each selected\n" +
      "account. With --only, only that role's password is required.\n"
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// ── Passwords ────────────────────────────────────────────────────────────────
// Never provide a fallback here. This script is intentionally manual, and a
// missing environment value must fail before any database connection or write.
const adminPasswordInput = process.env.SEED_ADMIN_PASSWORD?.trim();
const helperPasswordInput = process.env.SEED_HELPER_PASSWORD?.trim();
const userPasswordInput = process.env.SEED_USER_PASSWORD?.trim();

const passwordByRole: Record<AccountRole, string | undefined> = {
  admin: adminPasswordInput,
  helper: helperPasswordInput,
  user: userPasswordInput,
};
const passwordEnvByRole: Record<AccountRole, string> = {
  admin: "SEED_ADMIN_PASSWORD",
  helper: "SEED_HELPER_PASSWORD",
  user: "SEED_USER_PASSWORD",
};
const requiredRoles: readonly AccountRole[] = onlyRole ? [onlyRole] : ACCOUNT_ROLES;
const missingPasswords = requiredRoles
  .filter((role) => !passwordByRole[role])
  .map((role) => passwordEnvByRole[role]);

if (missingPasswords.length > 0) {
  const requiredScope = onlyRole
    ? `the selected ${onlyRole} test account`
    : "every test account";
  console.error(
    `\nERROR: account seeding requires explicit passwords for ${requiredScope}.\n` +
      `Missing: ${missingPasswords.join(", ")}\n` +
      "Set unique values in the environment and rerun.\n",
  );
  process.exit(1);
}

// ── Account definitions ───────────────────────────────────────────────────────
// Each account has separate `insertFields` (first-time creation) and
// `repairFields` (repair run for existing rows). The repair set explicitly
// includes is_suspended:false and token_version:0 so a previously-suspended
// or force-logged-out account is fully restored to a working state.

interface AccountDef {
  role: AccountRole;
  email: string;
  password: string;
  insertFields: Omit<typeof usersTable.$inferInsert, "email" | "password_hash">;
  repairFields: Partial<Omit<typeof usersTable.$inferInsert, "email">>;
}

// bcrypt cost factor 12 — matches the real register and reset-password routes
// so these hashed passwords authenticate through the normal login flow.
const BCRYPT_ROUNDS = 12;

const ALL_ACCOUNTS: AccountDef[] = [
  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    role: "admin",
    email: "admin@niakofa.app",
    password: passwordByRole.admin ?? "",
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
    password: passwordByRole.helper ?? "",
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
      // Location: Fort Worth, TX — the app's seeded "home base" (see
      // migration 0053's diaspora_hubs 'home' row and seed-fort-worth.ts).
      // Without a real lat/lng here, this account defaults to wherever the
      // browser/device last reported (or NULL), which can put it thousands
      // of miles from any request created during manual/e2e testing and
      // makes every claim attempt fail on the max-travel-distance guard.
      lat: 32.75,
      lng: -97.33,
      community_id: 1,
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
      lat: 32.75,
      lng: -97.33,
      community_id: 1,
    },
  },

  // ── Regular user ───────────────────────────────────────────────────────────
  {
    role: "user",
    email: "user@niakofa.app",
    password: passwordByRole.user ?? "",
    insertFields: {
      name: "User Test Account",
      account_type: "individual",
      is_suspended: false,
      approval_status: "approved",
      // Same Fort Worth home base as the helper account — see note above.
      lat: 32.75,
      lng: -97.33,
      community_id: 1,
    },
    repairFields: {
      account_type: "individual",
      is_suspended: false,
      approval_status: "approved",
      token_version: 0,
      lat: 32.75,
      lng: -97.33,
      community_id: 1,
    },
  },
];

const ACCOUNTS = ALL_ACCOUNTS.filter((account) => !onlyRole || account.role === onlyRole);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n▶ seed-test-accounts — connecting to database…");
  console.log(`  Target: ${looksLocal ? "local/dev (auto-detected)" : "NON-LOCAL (confirmed via flag)"}\n`);
  console.log(
    `  Selection: ${onlyRole ? `${onlyRole} only; other fixtures will not be touched` : "admin, helper, and user"}\n`,
  );

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

    // Atomic upsert — INSERT ... ON CONFLICT (email) DO UPDATE.
    // Safe under concurrent execution: no read-then-write race.
    // The conflict target is the unique email column (case-folded by the
    // unique index in the schema); we normalize to lowercase above.
    const [result] = await db
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        password_hash,
        ...acct.insertFields,
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          password_hash,
          ...acct.repairFields,
        },
      })
      .returning({ id: usersTable.id });
    const action = existing ? "repaired " : "created  ";
    console.log(`  ✔ ${action} ${acct.role.padEnd(6)} ${acct.email}  (id ${result.id})`);
  }

  console.log(`\n✅ ${onlyRole ? `The ${onlyRole} test account is` : "All three test accounts are"} ready.\n`);
  console.log("  Role    Email                    Password source");
  console.log("  ──────  ───────────────────────  ─────────────────────────────");
  for (const acct of ACCOUNTS) {
    console.log(
      `  ${acct.role.padEnd(6)} ${acct.email.padEnd(24)} ${passwordEnvByRole[acct.role]} (env)`,
    );
  }
  console.log("");
  if (ACCOUNTS.some((acct) => acct.role === "admin")) {
    console.log("  ℹ  Admin account:  /admin panel, Nia kill-switch, all management tabs.");
  }
  if (ACCOUNTS.some((acct) => acct.role === "helper")) {
    console.log("  ℹ  Helper account: helper mode, dispatch, navigation, rating flows.");
  }
  if (ACCOUNTS.some((acct) => acct.role === "user")) {
    console.log("  ℹ  User account:   standard requester flow end-to-end.");
  }
  if (!looksLocal) {
    console.log(
      "\n  ⚠  This ran against a non-local database. Treat the selected account(s) as\n" +
      "     disposable verification identities and remove or rotate them before\n" +
      "     opening the deployment to real users.\n"
    );
  }
  console.log("");

  await pool.end();
}

main().catch(async (err) => {
  console.error("\n✗ seed-test-accounts failed:", err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  process.exit(1);
});
