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
import {
  db,
  communitiesTable,
  usersTable,
  communityPoolLedgerTable,
  poolPendingMinimumsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { getSystemSetting, setSystemSetting } from "../lib/db-helpers";
import { normalizeMapboxStateCode } from "../lib/civic-geo";
import {
  COMMUNITY_POOL_ACTIVE_WINDOW_DAYS,
  getCommunityPoolReadiness,
} from "../lib/community-pool-readiness";

const router = Router();

const MAX_NAME_LEN = 120;

function isValidTargetReserve(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeCounty(value: string): string {
  return value.replace(/\s+County$/i, "").replace(/\s+/g, " ").trim();
}

// GET /admin/communities — live pool balance, member counts, and readiness
// for counties with recently active users. Also surfaces legacy NULL-scope
// balances even when no users remain in the global bucket.
router.get("/admin/communities", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const [communities, defaultIdSetting] = await Promise.all([
    // Limit 1 000: communities are geographic/county-level (bounded set) but an
    // uncapped SELECT would degrade as the platform adds more service regions.
    // 1 000 is well above any real deployment; the admin UI can paginate if needed.
    db.select().from(communitiesTable).orderBy(communitiesTable.id).limit(1000),
    getSystemSetting("default_community_id"),
  ]);

  const defaultCommunityId = defaultIdSetting ? parseInt(defaultIdSetting, 10) : null;

  const activeSince = new Date(
    Date.now() - COMMUNITY_POOL_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [balances, memberCounts, activeCounts, pendingMinimums] = await Promise.all([
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
    db
      .select({
        community_id: usersTable.community_id,
        active_users: sql<number>`COUNT(*)::int`,
        active_helpers: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.helper_mode_active})::int`,
      })
      .from(usersTable)
      .where(sql`${usersTable.deletion_status} = 'active'
        AND ${usersTable.location_updated_at} > ${activeSince}`)
      .groupBy(usersTable.community_id),
    db
      .select({
        community_id: poolPendingMinimumsTable.community_id,
        count: sql<number>`COUNT(*)::int`,
        total: sql<number>`COALESCE(SUM(${poolPendingMinimumsTable.amount}), 0)::float8`,
      })
      .from(poolPendingMinimumsTable)
      .where(eq(poolPendingMinimumsTable.status, "pending"))
      .groupBy(poolPendingMinimumsTable.community_id),
  ]);

  const balanceByCommunity = new Map<number | null, number>(
    balances.map(b => [b.community_id, Number(b.balance)]),
  );
  const membersByCommunity = new Map<number | null, number>(
    memberCounts.map(m => [m.community_id, Number(m.count)]),
  );
  const activeByCommunity = new Map<number | null, { users: number; helpers: number }>(
    activeCounts.map(row => [
      row.community_id,
      { users: Number(row.active_users), helpers: Number(row.active_helpers) },
    ]),
  );
  const pendingByCommunity = new Map<number | null, { count: number; total: number }>(
    pendingMinimums.map(row => [
      row.community_id,
      { count: Number(row.count), total: Number(row.total) },
    ]),
  );
  const communityIds = new Set(communities.map(community => community.id));
  const countyCommunityIds = new Set(
    communities
      .filter(community => Boolean(community.county?.trim() && community.state?.trim()))
      .map(community => community.id),
  );
  const missingCommunityId = (communityId: number | null) =>
    communityId !== null && !communityIds.has(communityId);
  const withoutCountyPool = (communityId: number | null) =>
    communityId === null || !countyCommunityIds.has(communityId);

  const activeUnassigned = activeCounts
    .filter(row => withoutCountyPool(row.community_id))
    .reduce(
      (total, row) => ({
        users: total.users + Number(row.active_users),
        helpers: total.helpers + Number(row.active_helpers),
        missing_community_users:
          total.missing_community_users +
          (missingCommunityId(row.community_id) ? Number(row.active_users) : 0),
        unscoped_community_users:
          total.unscoped_community_users +
          (row.community_id !== null && communityIds.has(row.community_id) && !countyCommunityIds.has(row.community_id)
            ? Number(row.active_users)
            : 0),
      }),
      { users: 0, helpers: 0, missing_community_users: 0, unscoped_community_users: 0 },
    );
  const pendingUnassigned = pendingMinimums
    .filter(row => withoutCountyPool(row.community_id))
    .reduce(
      (total, row) => ({
        count: total.count + Number(row.count),
        amount: total.amount + Number(row.total),
        missing_community_count:
          total.missing_community_count +
          (missingCommunityId(row.community_id) ? Number(row.count) : 0),
        unscoped_community_count:
          total.unscoped_community_count +
          (row.community_id !== null && communityIds.has(row.community_id) && !countyCommunityIds.has(row.community_id)
            ? Number(row.count)
            : 0),
      }),
      { count: 0, amount: 0, missing_community_count: 0, unscoped_community_count: 0 },
    );
  const missingCommunityMembers = memberCounts
    .filter(row => missingCommunityId(row.community_id))
    .reduce((total, row) => total + Number(row.count), 0);
  const unscopedCommunityMembers = memberCounts
    .filter(row =>
      row.community_id !== null &&
      communityIds.has(row.community_id) &&
      !countyCommunityIds.has(row.community_id),
    )
    .reduce((total, row) => total + Number(row.count), 0);
  const missingCommunityBalance = balances
    .filter(row => missingCommunityId(row.community_id))
    .reduce((total, row) => total + Number(row.balance), 0);
  const unscopedCommunityBalance = balances
    .filter(row =>
      row.community_id !== null &&
      communityIds.has(row.community_id) &&
      !countyCommunityIds.has(row.community_id),
    )
    .reduce((total, row) => total + Number(row.balance), 0);

  const result = communities.map(c => {
    const balance = balanceByCommunity.get(c.id) ?? 0;
    const activity = activeByCommunity.get(c.id) ?? { users: 0, helpers: 0 };
    const pending = pendingByCommunity.get(c.id) ?? { count: 0, total: 0 };
    const isCountyPool = countyCommunityIds.has(c.id);
    return {
      ...c,
      pool_balance: balance,
      member_count: membersByCommunity.get(c.id) ?? 0,
      is_county_pool: isCountyPool,
      active_user_count: activity.users,
      active_helper_count: activity.helpers,
      pending_minimums_count: pending.count,
      pending_minimums_total: pending.total,
      readiness_status: getCommunityPoolReadiness({
        isCountyPool,
        activeUserCount: activity.users,
        balance,
        targetReserveAmount: c.target_reserve_amount,
        pendingMinimumCount: pending.count,
      }),
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
      active_user_count: activeUnassigned.users,
      active_helper_count: activeUnassigned.helpers,
      missing_community_active_user_count: activeUnassigned.missing_community_users,
      unscoped_community_active_user_count: activeUnassigned.unscoped_community_users,
      pending_minimums_count: pendingUnassigned.count,
      pending_minimums_total: pendingUnassigned.amount,
      missing_community_pending_minimums_count: pendingUnassigned.missing_community_count,
      unscoped_community_pending_minimums_count: pendingUnassigned.unscoped_community_count,
      missing_community_member_count: missingCommunityMembers,
      missing_community_pool_balance: missingCommunityBalance,
      unscoped_community_member_count: unscopedCommunityMembers,
      unscoped_community_pool_balance: unscopedCommunityBalance,
    },
    active_window_days: COMMUNITY_POOL_ACTIVE_WINDOW_DAYS,
    default_community_id: isNaN(defaultCommunityId as number) ? null : defaultCommunityId,
  });
});

// POST /admin/communities — create a new county/region pool
router.post("/admin/communities", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { name, target_reserve_amount, hourly_rate, county: rawCounty, state: rawState } = req.body as {
    name?: string;
    target_reserve_amount?: number;
    hourly_rate?: number | null;
    county?: string;
    state?: string;
  };

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
  // hourly_rate: a positive number sets this county's livable-wage floor at
  // creation time; omitted or null means it inherits the global platform rate.
  if (hourly_rate !== undefined && hourly_rate !== null &&
      (typeof hourly_rate !== "number" || !Number.isFinite(hourly_rate) || hourly_rate <= 0)) {
    return res.status(400).json({ error: "hourly_rate must be a positive number or null" });
  }

  const county = rawCounty?.trim() ? normalizeCounty(rawCounty) : null;
  const state = rawState?.trim()
    ? normalizeMapboxStateCode(undefined, rawState.trim())
    : null;
  if ((rawCounty !== undefined || rawState !== undefined) && (!county || !state)) {
    return res.status(400).json({ error: "county and a valid US state are required together" });
  }
  if (county && state) {
    const duplicate = await db.execute<{ id: number }>(sql`
      SELECT id FROM communities
      WHERE LOWER(TRIM(REGEXP_REPLACE(county, '\\s+County$', '', 'i'))) = LOWER(TRIM(${county}))
        AND UPPER(TRIM(state)) = UPPER(TRIM(${state}))
      LIMIT 1
    `);
    if (duplicate.rows[0]) {
      return res.status(409).json({ error: "A community pool already exists for this county and state" });
    }
  }

  const [created] = await db
    .insert(communitiesTable)
    .values({
      name: trimmedName,
      ...(target_reserve_amount !== undefined ? { target_reserve_amount } : {}),
      ...(hourly_rate !== undefined ? { hourly_rate } : {}),
      ...(county && state ? { county, state } : {}),
    })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    return res.status(409).json({ error: "A community pool already exists for this county and state" });
  }
  logger.info({ community_id: created?.id, name: created?.name }, "admin-communities: created new community");
  return res.status(201).json(created);
});

// PATCH /admin/communities/:id — update name, target_reserve_amount, hourly_rate,
// and/or county branding fields (description, sponsor_name, sponsor_logo_url,
// county, state). All fields are optional — only provided fields are updated.
router.patch("/admin/communities/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existingCommunity] = await db
    .select({ county: communitiesTable.county, state: communitiesTable.state })
    .from(communitiesTable)
    .where(eq(communitiesTable.id, id))
    .limit(1);
  if (!existingCommunity) return res.status(404).json({ error: "Not found" });

  const {
    name,
    target_reserve_amount,
    hourly_rate,
    description,
    sponsor_name,
    sponsor_logo_url,
    county,
    state,
  } = req.body as {
    name?: string;
    target_reserve_amount?: number;
    hourly_rate?: number | null;
    description?: string | null;
    sponsor_name?: string | null;
    sponsor_logo_url?: string | null;
    county?: string | null;
    state?: string | null;
  };

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
  // hourly_rate: null clears county override (falls back to global rate); positive number sets it.
  if (hourly_rate !== undefined && hourly_rate !== null &&
      (typeof hourly_rate !== "number" || !Number.isFinite(hourly_rate) || hourly_rate <= 0)) {
    return res.status(400).json({ error: "hourly_rate must be a positive number or null" });
  }

  const patch: Record<string, unknown> = {};
  if (trimmedName !== undefined) patch.name = trimmedName;
  if (target_reserve_amount !== undefined) patch.target_reserve_amount = target_reserve_amount;
  if (hourly_rate !== undefined) patch.hourly_rate = hourly_rate;
  if (description !== undefined) patch.description = description;
  if (sponsor_name !== undefined) patch.sponsor_name = sponsor_name;
  if (sponsor_logo_url !== undefined) patch.sponsor_logo_url = sponsor_logo_url;
  if (county !== undefined || state !== undefined) {
    const requestedCounty = county === undefined ? existingCommunity.county : county;
    const requestedState = state === undefined ? existingCommunity.state : state;
    const nextCounty = requestedCounty?.trim() ? normalizeCounty(requestedCounty) : null;
    const nextState = requestedState?.trim()
      ? normalizeMapboxStateCode(undefined, requestedState.trim())
      : null;

    if ((nextCounty === null) !== (nextState === null)) {
      return res.status(400).json({ error: "county and a valid US state are required together" });
    }

    if (nextCounty && nextState) {
      const duplicate = await db.execute<{ id: number }>(sql`
        SELECT id FROM communities
        WHERE id <> ${id}
          AND LOWER(TRIM(REGEXP_REPLACE(county, '\\s+County$', '', 'i'))) = LOWER(TRIM(${nextCounty}))
          AND UPPER(TRIM(state)) = UPPER(TRIM(${nextState}))
        LIMIT 1
      `);
      if (duplicate.rows[0]) {
        return res.status(409).json({ error: "A community pool already exists for this county and state" });
      }
    }

    patch.county = nextCounty;
    patch.state = nextState;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "No updatable fields provided" });
  }

  const [updated] = await db
    .update(communitiesTable)
    .set(patch as Partial<typeof communitiesTable.$inferInsert>)
    .where(eq(communitiesTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  logger.info(
    { community_id: id, fields: Object.keys(patch) },
    "admin-communities: updated community"
  );
  return res.json(updated);
});

// PATCH /admin/communities/:id/set-default — set the default community that
// new registrations land in (writes system_settings.default_community_id).
router.patch("/admin/communities/:id/set-default", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [exists] = await db
    .select({ id: communitiesTable.id })
    .from(communitiesTable)
    .where(eq(communitiesTable.id, id))
    .limit(1);
  if (!exists) return res.status(404).json({ error: "Community not found" });

  await setSystemSetting("default_community_id", String(id));
  logger.info({ community_id: id }, "admin-communities: set default community");
  return res.json({ default_community_id: id });
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

  const { password_hash: _ph, password_reset_code: _prc, password_reset_expires_at: _pre, google_id: _gid, is_disposable_test_account: _disposableTestAccount, ...safeUser } = updated;
  logger.info({ user_id: userId, community_id: updated.community_id }, "admin-communities: reassigned user's community");
  return res.json(safeUser);
});

export default router;
