import { Router } from "express";
import { db, usersTable, requestsTable, gratitudePostsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { cacheGet, cacheSet, cacheDel } from "../lib/cache";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const LEADERBOARD_CACHE_KEY = "leaderboard:all";
const LEADERBOARD_TTL = 60; // 60 seconds

const router = Router();

// ── Tier helper (mirrors TrustTierBadge.tsx logic) ────────────────────────────
export function getTierName(trustScore: number, helpCount: number): string {
  if (helpCount >= 50 && trustScore >= 97) return "anchor";
  if (helpCount >= 30 && trustScore >= 95) return "elite";
  if (helpCount >= 15 && trustScore >= 90) return "trusted";
  if (helpCount >= 5 || trustScore >= 85) return "verified";
  return "member";
}

// ── Monthly contributions per helper ─────────────────────────────────────────
async function fetchMonthlyContributions(): Promise<Map<number, number>> {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  try {
    const rows = await db
      .select({
        helper_id: requestsTable.helper_id,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(requestsTable)
      .where(
        and(
          eq(requestsTable.status, "completed"),
          gte(requestsTable.completed_at, firstOfMonth)
        )
      )
      .groupBy(requestsTable.helper_id);

    const map = new Map<number, number>();
    for (const row of rows) {
      if (row.helper_id != null) map.set(row.helper_id, row.count);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Leaderboard query ─────────────────────────────────────────────────────────
async function fetchLeaderboard(city?: string) {
  const [helpers, monthlyMap] = await Promise.all([
    db
      .select()
      .from(usersTable)
      .where(eq(usersTable.is_helper, true))
      .orderBy(sql`${usersTable.help_count} * 10 + COALESCE(${usersTable.trust_score}, 0) DESC`)
      .limit(50),
    fetchMonthlyContributions(),
  ]);

  // City/neighborhood filter (case-insensitive)
  const filtered = city
    ? helpers.filter(
        (u) =>
          u.neighborhood?.toLowerCase().includes(city.toLowerCase()) ||
          u.city?.toLowerCase().includes(city.toLowerCase())
      )
    : helpers;

  const entries = filtered.slice(0, 25).map((u, i) => ({
    id: u.id,
    name: u.name,
    neighborhood: u.neighborhood ?? null,
    city: u.city ?? null,
    help_count: u.help_count ?? 0,
    trust_score: u.trust_score ?? 0,
    goodwill_score: u.goodwill_score ?? 0,
    avatar_url: u.avatar_url ?? null,
    tier: getTierName(u.trust_score ?? 0, u.help_count ?? 0),
    rank: i + 1,
    monthly_contributions: monthlyMap.get(u.id) ?? 0,
  }));

  // Determine city-level rankings (neighborhood #1 badge)
  // Group by neighborhood and find top helper per neighborhood
  const neighborhoodRank = new Map<string, number>(); // neighborhood → top helper id
  const seenNeighborhoods = new Set<string>();
  for (const entry of entries) {
    const hood = entry.neighborhood ?? entry.city ?? "";
    if (hood && !seenNeighborhoods.has(hood)) {
      seenNeighborhoods.add(hood);
      neighborhoodRank.set(hood, entry.id);
    }
  }

  return entries.map((entry) => {
    const hood = entry.neighborhood ?? entry.city ?? "";
    const isNeighborhoodTop = hood
      ? neighborhoodRank.get(hood) === entry.id
      : false;
    return { ...entry, is_neighborhood_top: isNeighborhoodTop };
  });
}

// ── Invalidate cache whenever the leaderboard changes ─────────────────────────
export async function invalidateLeaderboardCache(): Promise<void> {
  await cacheDel(LEADERBOARD_CACHE_KEY);
}

// ── Broadcast helper (called by requests.ts after completion) ─────────────────
export async function broadcastLeaderboardUpdate(
  changedUserId: number,
  prevHelpCount: number,
  prevTrustScore: number
): Promise<void> {
  const [[updatedUser], entries] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, changedUserId)).limit(1),
    fetchLeaderboard(),
  ]);

  const newTier = updatedUser
    ? getTierName(updatedUser.trust_score ?? 0, updatedUser.help_count ?? 0)
    : null;
  const oldTier = getTierName(prevTrustScore, prevHelpCount);

  broadcast({
    type: "leaderboard_update",
    payload: {
      entries,
      changed_user_id: changedUserId,
      tier_change:
        newTier && newTier !== oldTier && updatedUser
          ? { user_id: changedUserId, name: updatedUser.name, from_tier: oldTier, to_tier: newTier }
          : null,
    },
  });
}

// ── GET /leaderboard — initial HTTP fetch (cached 60s) ────────────────────────
router.get("/leaderboard", async (req, res) => {
  const city = req.query.city as string | undefined;
  const cacheKey = city ? `leaderboard:city:${city.toLowerCase()}` : LEADERBOARD_CACHE_KEY;

  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const entries = await fetchLeaderboard(city);
  await cacheSet(cacheKey, entries, LEADERBOARD_TTL);
  return res.json(entries);
});

// ── GET /leaderboard/cities — list of distinct cities/neighborhoods ────────────
router.get("/leaderboard/cities", async (_req, res) => {
  const helpers = await db
    .select({ neighborhood: usersTable.neighborhood, city: usersTable.city })
    .from(usersTable)
    .where(eq(usersTable.is_helper, true));

  const cities = new Set<string>();
  for (const h of helpers) {
    if (h.neighborhood) cities.add(h.neighborhood);
    if (h.city) cities.add(h.city);
  }

  return res.json(Array.from(cities).sort());
});

// ── POST /leaderboard/recalculate — force leaderboard recalculation ────────────
// Admin only. Invalidates cache and recalculates all rankings.
router.post("/leaderboard/recalculate", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  try {
    await invalidateLeaderboardCache();
    
    // Recalculate all helper trust scores and goodwill scores
    const helpers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.is_helper, true));
    
    let recalculated = 0;
    for (const helper of helpers) {
      // Recalculate help_count from actual completed requests
      const completedCount = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(requestsTable)
        .where(
          and(
            eq(requestsTable.helper_id, helper.id),
            eq(requestsTable.status, "completed")
          )
        );
      
      const actualHelpCount = completedCount[0]?.count ?? 0;
      
      // Recalculate goodwill_score from gratitude posts
      const goodwillResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${gratitudePostsTable.likes}), 0)::int` })
        .from(gratitudePostsTable)
        .where(eq(gratitudePostsTable.helper_id, helper.id));
      
      const actualGoodwill = goodwillResult[0]?.total ?? 0;
      
      // Update if different
      if (actualHelpCount !== helper.help_count || actualGoodwill !== helper.goodwill_score) {
        await db
          .update(usersTable)
          .set({
            help_count: actualHelpCount,
            goodwill_score: actualGoodwill,
          })
          .where(eq(usersTable.id, helper.id));
        recalculated++;
      }
    }
    
    // Fetch fresh leaderboard after recalculation
    const entries = await fetchLeaderboard();
    
    broadcast({
      type: "leaderboard_update",
      payload: {
        entries,
        recalculated,
        message: `Leaderboard recalculated: ${recalculated} helpers updated`,
      },
    });
    
    return res.json({
      ok: true,
      recalculated,
      message: `Leaderboard recalculated: ${recalculated} helpers updated`,
    });
  } catch (err) {
    logger.error({ err }, "leaderboard: recalculation failed");
    return res.status(500).json({ error: "Failed to recalculate leaderboard" });
  }
});

export default router;
