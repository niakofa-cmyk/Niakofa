#!/usr/bin/env python3
"""
patch_community_assignment.py

Closes the gap flagged in the July 2026 audit: users.community_id was never
written anywhere, so the per-community pool-health-ratio wage multiplier in
community-pool.ts (getGuaranteedMinimum) was fully built but silently inert —
every user resolved to the NULL/global bucket.

Changes:
  1. lib/db/src/../../../artifacts/api-server/src/lib/community-pool.ts
     - Adds getDefaultCommunityId(), resolving to system_settings.default_
       community_id if set, else the lowest-id community row, else null.
  2. artifacts/api-server/src/routes/users.ts
     - Assigns community_id at email/password registration.
  3. artifacts/api-server/src/routes/google-auth.ts
     - Assigns community_id when a brand-new account is created via Google
       Sign-In.
  4. artifacts/api-server/src/routes/admin-communities.ts (NEW FILE)
     - Admin CRUD for the communities table + endpoint to reassign a user's
       community.
  5. artifacts/api-server/src/routes/index.ts
     - Registers the new admin-communities router.
  6. artifacts/pay-it-forward/src/hooks/useNiaStory.ts
     - Minor fix: rec.lang was "" (empty); set to "en-US" explicitly.

Run from the repo root:
    python3 patch_community_assignment.py

Idempotent: safe to re-run; already-patched files are detected and skipped.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
API_SERVER = REPO_ROOT / "artifacts" / "api-server" / "src"
PIF = REPO_ROOT / "artifacts" / "pay-it-forward" / "src"


def read(path: Path) -> str:
    if not path.exists():
        print(f"ERROR: expected file not found: {path}", file=sys.stderr)
        sys.exit(1)
    return path.read_text(encoding="utf-8")


def write(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def patch_community_pool_lib() -> None:
    path = API_SERVER / "lib" / "community-pool.ts"
    content = read(path)

    marker = "export async function getDefaultCommunityId("
    if marker in content:
        print(f"SKIP (already patched): {path}")
        return

    anchor = '/**\n * Compute the guaranteed minimum for a completed task.'
    assert anchor in content, f"anchor not found in {path}"

    insertion = '''/**
 * Returns the community_id new users should be assigned to at registration.
 *
 * Prior to this function, `users.community_id` was never written anywhere in
 * the codebase — every user resolved to the NULL/global bucket regardless of
 * getGuaranteedMinimum()'s per-community pool-health-ratio logic below, which
 * was fully implemented but silently inert. This closes that gap.
 *
 * Resolution order:
 *   1. system_settings.default_community_id, if set and it references a real
 *      community row (lets an admin designate a primary county explicitly).
 *   2. The lowest-id community row — the seeded "Tarrant County" row on a
 *      fresh install.
 *   3. null — no communities exist yet; new user falls back to the legacy
 *      global pool bucket, exactly as every user did before this change.
 */
export async function getDefaultCommunityId(): Promise<number | null> {
  try {
    const [settingRow] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "default_community_id"))
      .limit(1);
    const configured = settingRow ? parseInt(settingRow.value, 10) : NaN;
    if (Number.isFinite(configured)) {
      const [exists] = await db
        .select({ id: communitiesTable.id })
        .from(communitiesTable)
        .where(eq(communitiesTable.id, configured))
        .limit(1);
      if (exists) return exists.id;
      logger.warn(
        { configured },
        "community-pool: default_community_id setting points to a missing community — falling back",
      );
    }

    const [first] = await db
      .select({ id: communitiesTable.id })
      .from(communitiesTable)
      .orderBy(asc(communitiesTable.id))
      .limit(1);
    return first?.id ?? null;
  } catch (err) {
    logger.error({ err }, "community-pool: getDefaultCommunityId DB error — new user will fall back to global pool");
    return null;
  }
}

/**
 * Compute the guaranteed minimum for a completed task.'''

    content = content.replace(anchor, insertion, 1)
    write(path, content)
    print(f"PATCHED: {path}")


def patch_users_route() -> None:
    path = API_SERVER / "routes" / "users.ts"
    content = read(path)

    if 'import { getDefaultCommunityId } from "../lib/community-pool";' in content:
        print(f"SKIP (already patched): {path}")
        return

    import_anchor = 'import { userSelect } from "../lib/user-select";'
    assert import_anchor in content, f"import anchor not found in {path}"
    content = content.replace(
        import_anchor,
        import_anchor + '\nimport { getDefaultCommunityId } from "../lib/community-pool";',
        1,
    )

    insert_anchor = '''  const REQUIRES_REVIEW = ["organization", "business", "sponsor"];
  const approval_status = REQUIRES_REVIEW.includes(account_type) ? "pending" : "approved";

  const [user] = await db.insert(usersTable).values({
    name, email: normalizedEmail,
    password_hash,
    avatar_url: avatar_url ?? null,
    is_helper: is_helper ?? false,
    neighborhood: neighborhood ?? null,
    account_type,
    organization_name: ["organization", "business", "sponsor"].includes(account_type) ? (body.organization_name ?? null) : null,
    organization_description: ["organization", "business", "sponsor"].includes(account_type) ? (body.organization_description ?? null) : null,
    approval_status,
  }).returning();'''
    assert insert_anchor in content, f"registration insert block not found in {path}"

    replacement = '''  const REQUIRES_REVIEW = ["organization", "business", "sponsor"];
  const approval_status = REQUIRES_REVIEW.includes(account_type) ? "pending" : "approved";

  // Assign every new user to a real community row (defaults to the seeded
  // "Tarrant County" pool, or whichever community an admin has designated via
  // system_settings.default_community_id). Previously community_id was never
  // set anywhere, so every user fell into the NULL/global bucket and the
  // per-community pool-health-ratio wage multiplier in community-pool.ts
  // never actually differentiated anything. A lookup failure here must never
  // block registration — fall back to null (legacy global bucket) exactly
  // like before this change.
  const community_id = await getDefaultCommunityId().catch(() => null);

  const [user] = await db.insert(usersTable).values({
    name, email: normalizedEmail,
    password_hash,
    avatar_url: avatar_url ?? null,
    is_helper: is_helper ?? false,
    neighborhood: neighborhood ?? null,
    account_type,
    organization_name: ["organization", "business", "sponsor"].includes(account_type) ? (body.organization_name ?? null) : null,
    organization_description: ["organization", "business", "sponsor"].includes(account_type) ? (body.organization_description ?? null) : null,
    approval_status,
    community_id,
  }).returning();'''

    content = content.replace(insert_anchor, replacement, 1)
    write(path, content)
    print(f"PATCHED: {path}")


def patch_google_auth_route() -> None:
    path = API_SERVER / "routes" / "google-auth.ts"
    content = read(path)

    if 'import { getDefaultCommunityId } from "../lib/community-pool";' in content:
        print(f"SKIP (already patched): {path}")
        return

    import_anchor = 'import { broadcast } from "../lib/ws-hub";'
    assert import_anchor in content, f"import anchor not found in {path}"
    content = content.replace(
        import_anchor,
        import_anchor + '\nimport { getDefaultCommunityId } from "../lib/community-pool";',
        1,
    )

    insert_anchor = '''      try {
        const [created_user] = await db
          .insert(usersTable)
          .values({
            name:            googleName,
            email:           googleEmail,
            google_id:       googleSub,
            oauth_provider:  "google",
            avatar_url:      googlePicture,
            approval_status: "approved", // Google-verified email = trusted identity
            account_type:    "individual",
            // password_hash intentionally NULL — OAuth accounts never need a password
          })
          .returning();'''
    assert insert_anchor in content, f"google-auth insert block not found in {path}"

    replacement = '''      try {
        // Same default-community assignment as email/password registration
        // (users.ts) — must never block account creation on failure.
        const community_id = await getDefaultCommunityId().catch(() => null);

        const [created_user] = await db
          .insert(usersTable)
          .values({
            name:            googleName,
            email:           googleEmail,
            google_id:       googleSub,
            oauth_provider:  "google",
            avatar_url:      googlePicture,
            approval_status: "approved", // Google-verified email = trusted identity
            account_type:    "individual",
            community_id,
            // password_hash intentionally NULL — OAuth accounts never need a password
          })
          .returning();'''

    content = content.replace(insert_anchor, replacement, 1)
    write(path, content)
    print(f"PATCHED: {path}")


ADMIN_COMMUNITIES_SRC = '''/**
 * Niakofa — Admin Communities Routes
 *
 * CRUD for the `communities` table (county/region-scoped funding pools) plus
 * an endpoint to move a user between communities.
 *
 * Context: the pool-health-ratio wage multiplier in
 * artifacts/api-server/src/lib/community-pool.ts (getGuaranteedMinimum) has
 * always read `users.community_id` and scoped `community_pool_ledger` by it —
 * but until the July 2026 audit fix, nothing in the codebase ever wrote
 * community_id anywhere, so every user resolved to the NULL/global bucket and
 * the feature was fully built but inert. New registrations (users.ts,
 * google-auth.ts) now assign a default community via getDefaultCommunityId().
 * This file is the admin-facing half: create/edit communities, and manually
 * move a specific user into one.
 */
import { Router } from "express";
import { db, communitiesTable, usersTable, communityPoolLedgerTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

const MAX_NAME_LEN = 120;

function isValidTargetReserve(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// GET /admin/communities — list all communities with live pool balance,
// member count, and current pool-health ratio (same clamp used by
// getGuaranteedMinimum). Also surfaces the legacy global/NULL bucket so
// admins can see how many users are still unassigned.
router.get("/admin/communities", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const communities = await db.select().from(communitiesTable).orderBy(communitiesTable.id);

  const [balances, memberCounts] = await Promise.all([
    db
      .select({
        community_id: communityPoolLedgerTable.community_id,
        balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8`,
      })
      .from(communityPoolLedgerTable)
      .groupBy(communityPoolLedgerTable.community_id),
    db
      .select({
        community_id: usersTable.community_id,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(usersTable)
      .groupBy(usersTable.community_id),
  ]);

  const balanceByCommunity = new Map<number | null, number>(
    balances.map(b => [b.community_id, Number(b.balance)]),
  );
  const membersByCommunity = new Map<number | null, number>(
    memberCounts.map(m => [m.community_id, Number(m.count)]),
  );

  const result = communities.map(c => {
    const balance = balanceByCommunity.get(c.id) ?? 0;
    return {
      ...c,
      pool_balance: balance,
      member_count: membersByCommunity.get(c.id) ?? 0,
      pool_health_ratio:
        c.target_reserve_amount > 0
          ? Math.min(1.0, Math.max(0.5, balance / c.target_reserve_amount))
          : 1.0,
    };
  });

  return res.json({
    communities: result,
    unassigned: {
      pool_balance: balanceByCommunity.get(null) ?? 0,
      member_count: membersByCommunity.get(null) ?? 0,
    },
  });
});

// POST /admin/communities — create a new county/region pool
router.post("/admin/communities", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { name, target_reserve_amount } = req.body as { name?: string; target_reserve_amount?: number };

  const trimmedName = name?.trim();
  if (!trimmedName) {
    return res.status(400).json({ error: "name is required" });
  }
  if (trimmedName.length > MAX_NAME_LEN) {
    return res.status(400).json({ error: `name must be ${MAX_NAME_LEN} characters or fewer` });
  }
  if (target_reserve_amount !== undefined && !isValidTargetReserve(target_reserve_amount)) {
    return res.status(400).json({ error: "target_reserve_amount must be a positive number" });
  }

  const [created] = await db
    .insert(communitiesTable)
    .values({
      name: trimmedName,
      ...(target_reserve_amount !== undefined ? { target_reserve_amount } : {}),
    })
    .returning();

  logger.info({ community_id: created?.id, name: created?.name }, "admin-communities: created new community");
  return res.status(201).json(created);
});

// PATCH /admin/communities/:id — update name and/or target_reserve_amount
router.patch("/admin/communities/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { name, target_reserve_amount } = req.body as { name?: string; target_reserve_amount?: number };

  let trimmedName: string | undefined;
  if (name !== undefined) {
    trimmedName = name.trim();
    if (!trimmedName) return res.status(400).json({ error: "name cannot be empty" });
    if (trimmedName.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: `name must be ${MAX_NAME_LEN} characters or fewer` });
    }
  }
  if (target_reserve_amount !== undefined && !isValidTargetReserve(target_reserve_amount)) {
    return res.status(400).json({ error: "target_reserve_amount must be a positive number" });
  }

  const [updated] = await db
    .update(communitiesTable)
    .set({
      ...(trimmedName !== undefined ? { name: trimmedName } : {}),
      ...(target_reserve_amount !== undefined ? { target_reserve_amount } : {}),
    })
    .where(eq(communitiesTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  logger.info({ community_id: id }, "admin-communities: updated community");
  return res.json(updated);
});

// PATCH /admin/users/:id/community — assign/reassign a single user's community.
// Pass { community_id: null } to move a user back to the legacy global bucket.
router.patch("/admin/users/:id/community", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const userId = parseInt(req.params.id as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid user id" });

  const { community_id } = req.body as { community_id?: number | null };
  if (community_id !== null && community_id !== undefined && typeof community_id !== "number") {
    return res.status(400).json({ error: "community_id must be a number or null" });
  }

  if (typeof community_id === "number") {
    const [exists] = await db
      .select({ id: communitiesTable.id })
      .from(communitiesTable)
      .where(eq(communitiesTable.id, community_id))
      .limit(1);
    if (!exists) return res.status(400).json({ error: "No community with that id" });
  }

  const [updated] = await db
    .update(usersTable)
    .set({ community_id: community_id ?? null, updated_at: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updated) return res.status(404).json({ error: "User not found" });

  // Strip sensitive fields before returning (same pattern as users.ts).
  const { password_hash: _ph, password_reset_code: _prc, password_reset_expires_at: _pre, google_id: _gid, ...safeUser } = updated;
  logger.info({ user_id: userId, community_id: updated.community_id }, "admin-communities: reassigned user's community");
  return res.json(safeUser);
});

export default router;
'''


def create_admin_communities_route() -> None:
    path = API_SERVER / "routes" / "admin-communities.ts"
    if path.exists():
        print(f"SKIP (already exists): {path}")
        return
    write(path, ADMIN_COMMUNITIES_SRC)
    print(f"CREATED: {path}")


def patch_routes_index() -> None:
    path = API_SERVER / "routes" / "index.ts"
    content = read(path)

    if 'adminCommunitiesRouter' in content:
        print(f"SKIP (already patched): {path}")
        return

    import_anchor = 'import adminAnalyticsRouter from "./admin-analytics";'
    assert import_anchor in content, f"import anchor not found in {path}"
    content = content.replace(
        import_anchor,
        import_anchor + '\nimport adminCommunitiesRouter from "./admin-communities";',
        1,
    )

    use_anchor = "router.use(adminAnalyticsRouter);"
    assert use_anchor in content, f"router.use anchor not found in {path}"
    content = content.replace(
        use_anchor,
        use_anchor + "\nrouter.use(adminCommunitiesRouter);",
        1,
    )

    write(path, content)
    print(f"PATCHED: {path}")


def patch_use_nia_story() -> None:
    path = PIF / "hooks" / "useNiaStory.ts"
    content = read(path)

    if 'rec.lang = "en-US";' in content:
        print(f"SKIP (already patched): {path}")
        return

    anchor = 'rec.lang = "";'
    assert anchor in content, f"rec.lang anchor not found in {path}"
    content = content.replace(anchor, 'rec.lang = "en-US";', 1)
    write(path, content)
    print(f"PATCHED: {path}")


def main() -> None:
    patch_community_pool_lib()
    patch_users_route()
    patch_google_auth_route()
    create_admin_communities_route()
    patch_routes_index()
    patch_use_nia_story()
    print("\nDone. Next steps:")
    print("  1. Review the diffs (git diff).")
    print("  2. pnpm run typecheck")
    print("  3. Optionally set system_settings.default_community_id if you")
    print("     want new signups to go to a community other than the lowest id.")
    print("  4. Deploy as usual.")


if __name__ == "__main__":
    main()
