/**
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

  const { password_hash: _ph, password_reset_code: _prc, password_reset_expires_at: _pre, google_id: _gid, ...safeUser } = updated;
  logger.info({ user_id: userId, community_id: updated.community_id }, "admin-communities: reassigned user's community");
  return res.json(safeUser);
});

export default router;
