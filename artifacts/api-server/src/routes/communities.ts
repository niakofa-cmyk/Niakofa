/**
 * Niakofa — Public Communities Routes
 *
 * Public-facing county/community portal endpoints. No auth required — these
 * are transparency endpoints so any visitor can see what their county's
 * community fund has done, similar to a public ledger.
 *
 * Admin CRUD lives in admin-communities.ts (requireAdmin gated).
 */
import { Router } from "express";
import { db, communitiesTable, communityPoolLedgerTable, usersTable } from "@workspace/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { getDefaultCommunityId, getHourlyMinimumRate } from "../lib/community-pool";

const router = Router();

async function buildCommunityStats(community: typeof communitiesTable.$inferSelect, ledgerRows: {
  balance: number;
  total_contributed: number;
  total_fronted: number;
  total_repaid: number;
  total_minimums: number;
  helpers_paid: number;
  sponsor_count: number;
  inflow_30d: number;
  outflow_30d: number;
  helpers_earned_7d?: number;
  helpers_paid_7d?: number;
}, memberCount: number) {
  const balance = Number(ledgerRows.balance);
  const target  = community.target_reserve_amount ?? 10000;
  const poolHealthRatio = target > 0
    ? Math.min(1.0, Math.max(0.5, balance / target))
    : 1.0;
  const poolPct = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 100;

  // The county-level livable-wage floor helpers can rely on for this
  // community — falls back to the global platform rate when the county
  // hasn't set its own override (see getHourlyMinimumRate for resolution
  // order). Surfaced publicly so requesters and helpers can both see the
  // real guaranteed minimum, not just a marketing number.
  const minimumHourlyRate = await getHourlyMinimumRate(community.id);

  return {
    id: community.id,
    name: community.name,
    target_reserve_amount: target,
    pool_balance: balance,
    pool_health_ratio: poolHealthRatio,
    pool_pct: poolPct,
    member_count: memberCount,
    total_contributed: Number(ledgerRows.total_contributed),
    total_paid_to_helpers: Number(ledgerRows.total_fronted) + Number(ledgerRows.total_minimums),
    total_repaid: Number(ledgerRows.total_repaid),
    helpers_paid: Number(ledgerRows.helpers_paid),
    sponsor_count: Number(ledgerRows.sponsor_count),
    inflow_30d: Number(ledgerRows.inflow_30d),
    outflow_30d: Number(ledgerRows.outflow_30d),
    // Weekly transparency stats: surfaces "good people paid every day" promise
    // as a real number. Shown on the community page pool tab.
    helpers_earned_7d: Number(ledgerRows.helpers_earned_7d ?? 0),
    helpers_paid_7d: Number(ledgerRows.helpers_paid_7d ?? 0),
    minimum_hourly_rate: minimumHourlyRate,
    // True when this county set its own livable-wage override rather than
    // inheriting the global platform default — lets the UI distinguish
    // "this county chose $18/hr" from "no one has set a rate here yet".
    hourly_rate_is_county_override: community.hourly_rate != null && community.hourly_rate > 0,
    county: community.county ?? null,
    state: community.state ?? null,
    created_at: community.created_at,
  };
}

async function fetchCommunityData(communityId: number) {
  const [community] = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.id, communityId))
    .limit(1);

  if (!community) return null;

  const [ledger, memberRow] = await Promise.all([
    db
      .select({
        balance:           sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8`,
        total_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        total_fronted:     sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'helper_front' THEN -${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        total_repaid:      sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'pledge_repayment' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        total_minimums:    sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'guaranteed_minimum' THEN -${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        helpers_paid:      sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') THEN ${communityPoolLedgerTable.user_id} END)::int`,
        sponsor_count:     sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN ${communityPoolLedgerTable.user_id} END)::int`,
        inflow_30d:        sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.amount} > 0 AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '30 days' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        outflow_30d:       sql<number>`COALESCE(ABS(SUM(CASE WHEN ${communityPoolLedgerTable.amount} < 0 AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '30 days' THEN ${communityPoolLedgerTable.amount} ELSE 0 END)), 0)::float8`,
        // "Helpers Earned This Week" transparency stat — how much the community
        // paid helpers in the last 7 days. Surfaces the "good people paid every
        // day" promise as a real number on the community page.
        helpers_earned_7d: sql<number>`COALESCE(ABS(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '7 days' THEN ${communityPoolLedgerTable.amount} ELSE 0 END)), 0)::float8`,
        helpers_paid_7d:   sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '7 days' THEN ${communityPoolLedgerTable.user_id} END)::int`,
      })
      .from(communityPoolLedgerTable)
      .where(eq(communityPoolLedgerTable.community_id, communityId)),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.community_id, communityId)),
  ]);

  const ledgerRow = ledger[0] ?? {
    balance: 0, total_contributed: 0, total_fronted: 0, total_repaid: 0,
    total_minimums: 0, helpers_paid: 0, sponsor_count: 0, inflow_30d: 0, outflow_30d: 0,
    helpers_earned_7d: 0, helpers_paid_7d: 0,
  };

  return buildCommunityStats(community, ledgerRow, Number(memberRow[0]?.count ?? 0));
}

/**
 * GET /communities/default — public stats for the default community.
 * Resolves via getDefaultCommunityId() (same logic as signup assignment).
 * Used by the county portal tab to auto-load the primary community without
 * requiring the caller to know a specific ID.
 */
router.get("/communities/default", generalApiLimiter, async (_req, res) => {
  try {
    const defaultId = await getDefaultCommunityId();
    if (defaultId == null) {
      return res.json({ community: null, message: "No communities seeded yet" });
    }
    const data = await fetchCommunityData(defaultId);
    return res.json({ community: data });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to load community data" });
  }
});

/**
 * GET /communities — public list of all communities with summary stats.
 */
router.get("/communities", generalApiLimiter, async (_req, res) => {
  try {
    const communities = await db
      .select()
      .from(communitiesTable)
      .orderBy(asc(communitiesTable.id));

    if (communities.length === 0) {
      return res.json({ communities: [] });
    }

    const [balances, memberCounts] = await Promise.all([
      db
        .select({
          community_id:      communityPoolLedgerTable.community_id,
          balance:           sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8`,
          total_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
          helpers_paid:      sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') THEN ${communityPoolLedgerTable.user_id} END)::int`,
        })
        .from(communityPoolLedgerTable)
        .groupBy(communityPoolLedgerTable.community_id),
      db
        .select({
          community_id: usersTable.community_id,
          count:        sql<number>`COUNT(*)::int`,
        })
        .from(usersTable)
        .groupBy(usersTable.community_id),
    ]);

    const balMap    = new Map(balances.map(b => [b.community_id, b]));
    const memberMap = new Map(memberCounts.map(m => [m.community_id, Number(m.count)]));

    const result = communities.map(c => {
      const bal = balMap.get(c.id);
      const balance = Number(bal?.balance ?? 0);
      const target  = c.target_reserve_amount ?? 10000;
      return {
        id: c.id,
        name: c.name,
        pool_balance: balance,
        pool_health_ratio: target > 0 ? Math.min(1.0, Math.max(0.5, balance / target)) : 1.0,
        pool_pct: target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 100,
        target_reserve_amount: target,
        member_count: memberMap.get(c.id) ?? 0,
        total_contributed: Number(bal?.total_contributed ?? 0),
        helpers_paid: Number(bal?.helpers_paid ?? 0),
        // Raw county override only (no extra query here) — null means this
        // county inherits the global platform rate. Use GET /communities/:id
        // for the fully-resolved effective rate.
        hourly_rate: c.hourly_rate ?? null,
        created_at: c.created_at,
      };
    });

    return res.json({ communities: result });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to load communities" });
  }
});

/**
 * GET /communities/:id — public stats for one community.
 */
router.get("/communities/:id", generalApiLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const data = await fetchCommunityData(id);
    if (!data) return res.status(404).json({ error: "Community not found" });
    return res.json({ community: data });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to load community data" });
  }
});

/**
 * GET /communities/:id/ledger — recent public ledger entries for a community.
 * Shows the last 20 entries. The raw `notes` field is intentionally omitted:
 * it contains free-text request titles (e.g. "Helper paid for: <title>") which
 * may include sensitive personal details from categories like medical,
 * mental_health_peer, senior_care, and legal_aid. A generic description is
 * derived from entry_type instead.
 */
router.get("/communities/:id/ledger", generalApiLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const rows = await db
      .select({
        id:         communityPoolLedgerTable.id,
        entry_type: communityPoolLedgerTable.entry_type,
        amount:     communityPoolLedgerTable.amount,
        created_at: communityPoolLedgerTable.created_at,
      })
      .from(communityPoolLedgerTable)
      .where(eq(communityPoolLedgerTable.community_id, id))
      .orderBy(desc(communityPoolLedgerTable.created_at))
      .limit(20);

    // Derive a safe, generic description from entry_type so the frontend
    // has something human-readable without exposing requester-supplied text.
    // Keys must match the canonical entry_type values written by community-pool.ts.
    const ENTRY_LABELS: Record<string, string> = {
      sponsor_contribution: "Community contribution received",
      helper_front:         "Helper paid for a completed task",
      guaranteed_minimum:   "Guaranteed minimum for a completed task",
      pledge_repayment:     "Pay-it-forward repayment received",
      adjustment:           "Pool balance adjustment",
    };

    const entries = rows.map(r => ({
      ...r,
      description: ENTRY_LABELS[r.entry_type] ?? "Pool activity",
    }));

    return res.json({ entries });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to load ledger" });
  }
});

export default router;
