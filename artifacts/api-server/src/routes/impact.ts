/**
 * GET /impact/:county — Public county-branded impact dashboard.
 *
 * No authentication required. Returns community stats for a specific county
 * so county portals, sponsor pages, and public status pages can show real
 * local impact numbers without requiring users to log in.
 *
 * Lookup: communities.county column (e.g. "tarrant"), case-insensitive.
 * Also accepts the numeric community id as a fallback.
 */
import { Router } from "express";
import { db, communitiesTable, requestsTable, usersTable, communityPoolLedgerTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

// GET /impact/:county — public impact stats for a county/community.
// :county can be a county slug (e.g. "tarrant") or a numeric community id.
router.get("/impact/:county", generalApiLimiter, async (req, res) => {
  const param = req.params.county as string;

  try {
    // Resolve the community by county slug (case-insensitive) or numeric id.
    let community: typeof communitiesTable.$inferSelect | undefined;

    const numericId = parseInt(param, 10);
    if (!isNaN(numericId)) {
      [community] = await db
        .select()
        .from(communitiesTable)
        .where(eq(communitiesTable.id, numericId))
        .limit(1);
    }

    if (!community) {
      [community] = await db
        .select()
        .from(communitiesTable)
        .where(sql`LOWER(${communitiesTable.county}) = LOWER(${param})`)
        .limit(1);
    }

    // Also try matching by name for backward compat (e.g. "tarrant-county").
    if (!community) {
      [community] = await db
        .select()
        .from(communitiesTable)
        .where(sql`LOWER(REPLACE(${communitiesTable.name}, ' ', '-')) = LOWER(${param})`)
        .limit(1);
    }

    if (!community) {
      return res.status(404).json({ error: "County not found", county: param });
    }

    const communityId = community.id;

    // Run all stat queries in parallel for low latency.
    const [
      poolRow,
      requestStats,
      activeHelperRow,
      recentCompletions,
      topCategories,
    ] = await Promise.all([
      // Community pool balance (scoped to this community)
      db
        .select({
          balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8`,
          total_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
          total_fronted: sql<number>`COALESCE(ABS(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') THEN ${communityPoolLedgerTable.amount} ELSE 0 END)), 0)::float8`,
          helpers_paid: sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') THEN ${communityPoolLedgerTable.user_id} END)::int`,
        })
        .from(communityPoolLedgerTable)
        .where(eq(communityPoolLedgerTable.community_id, communityId)),

      // Request counts and completion rate for this community's helpers/requesters
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          completed: sql<number>`COUNT(*) FILTER (WHERE ${requestsTable.status} = 'completed')::int`,
          open: sql<number>`COUNT(*) FILTER (WHERE ${requestsTable.status} = 'open')::int`,
        })
        .from(requestsTable)
        .where(
          sql`${requestsTable.requester_id} IN (
            SELECT id FROM users WHERE community_id = ${communityId}
          )`
        ),

      // Active helpers in this community right now
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.community_id, communityId),
            eq(usersTable.helper_mode_active, true)
          )
        ),

      // Completions in the last 30 days
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(requestsTable)
        .where(
          sql`${requestsTable.status} = 'completed'
            AND ${requestsTable.completed_at} > NOW() - INTERVAL '30 days'
            AND ${requestsTable.requester_id} IN (
              SELECT id FROM users WHERE community_id = ${communityId}
            )`
        ),

      // Top 5 categories served
      db
        .select({
          category: requestsTable.category,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(requestsTable)
        .where(
          and(
            eq(requestsTable.status, "completed"),
            sql`${requestsTable.requester_id} IN (
              SELECT id FROM users WHERE community_id = ${communityId}
            )`
          )
        )
        .groupBy(requestsTable.category)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(5),
    ]);

    const pool = poolRow[0];
    const requests = requestStats[0];
    const completionRate =
      requests?.total > 0
        ? Math.round(((requests.completed ?? 0) / requests.total) * 100)
        : 0;

    return res.json({
      community: {
        id:               community.id,
        name:             community.name,
        county:           community.county,
        state:            community.state,
        description:      community.description,
        sponsor_name:     community.sponsor_name,
        sponsor_logo_url: community.sponsor_logo_url,
        hourly_rate:      community.hourly_rate,
        target_reserve:   community.target_reserve_amount,
      },
      pool: {
        balance:           pool?.balance ?? 0,
        total_contributed: pool?.total_contributed ?? 0,
        total_fronted:     pool?.total_fronted ?? 0,
        helpers_paid:      pool?.helpers_paid ?? 0,
        health_pct:
          community.target_reserve_amount > 0
            ? Math.round(Math.min(100, ((pool?.balance ?? 0) / community.target_reserve_amount) * 100))
            : 100,
      },
      requests: {
        total:           requests?.total ?? 0,
        completed:       requests?.completed ?? 0,
        open:            requests?.open ?? 0,
        completion_rate: completionRate,
      },
      helpers: {
        active_now:  activeHelperRow[0]?.count ?? 0,
      },
      activity: {
        completions_30d: recentCompletions[0]?.count ?? 0,
        top_categories:  topCategories,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, county: param }, "impact: failed to build county stats");
    return res.status(500).json({ error: "Failed to load impact data" });
  }
});

// GET /impact — list all communities with basic stats (for landing / county picker)
router.get("/impact", generalApiLimiter, async (_req, res) => {
  try {
    const communities = await db
      .select({
        id:               communitiesTable.id,
        name:             communitiesTable.name,
        county:           communitiesTable.county,
        state:            communitiesTable.state,
        description:      communitiesTable.description,
        sponsor_name:     communitiesTable.sponsor_name,
        sponsor_logo_url: communitiesTable.sponsor_logo_url,
      })
      .from(communitiesTable)
      .orderBy(communitiesTable.id);

    return res.json({ communities });
  } catch (err) {
    logger.error({ err }, "impact: failed to list communities");
    return res.status(500).json({ error: "Failed to load community list" });
  }
});

export default router;
