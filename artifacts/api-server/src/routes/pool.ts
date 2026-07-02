import { Router } from "express";
import { db, communityPoolLedgerTable, poolPendingMinimumsTable, usersTable, requestsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { paymentLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { broadcast } from "../lib/ws-hub";
import {
  getPoolBalance,
  getGuaranteedMinimum,
  isPoolEnabled,
  recordPoolContribution,
  processPendingMinimums,
} from "../lib/community-pool";
import Stripe from "stripe";

const _STRIPE_SK = process.env["STRIPE_SECRET_KEY"] ?? "";
const _stripe = _STRIPE_SK
  ? new Stripe(_STRIPE_SK, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

const router = Router();

/**
 * GET /pool/stats — public transparency stats for the Community Pool.
 * Explicitly rate-limited: this endpoint runs several aggregate SUM queries.
 */
router.get("/pool/stats", generalApiLimiter, async (_req, res) => {
  try {
    const [totals] = await db
      .select({
        balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8`,
        total_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        total_fronted: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'helper_front' THEN -${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        total_repaid: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'pledge_repayment' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        total_minimums: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'guaranteed_minimum' THEN -${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        helpers_fronted: sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') THEN ${communityPoolLedgerTable.user_id} END)::int`,
        sponsor_count: sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN ${communityPoolLedgerTable.user_id} END)::int`,
        // ── 30-day runway metrics ─────────────────────────────────────────────
        // inflow: all positive ledger entries (contributions + repayments) in last 30d
        inflow_30d: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.amount} > 0 AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '30 days' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        // outflow: ABS of all negative ledger entries (fronts + minimums) in last 30d
        outflow_30d: sql<number>`COALESCE(ABS(SUM(CASE WHEN ${communityPoolLedgerTable.amount} < 0 AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '30 days' THEN ${communityPoolLedgerTable.amount} ELSE 0 END)), 0)::float8`,
      })
      .from(communityPoolLedgerTable);

    // Outstanding PIF pledges: money owed back to the pool by past requesters.
    // This is expected future inflow — important for runway context.
    const [outstandingPif] = await db
      .select({
        total: sql<number>`COALESCE(SUM(COALESCE(${requestsTable.pledge_amount}, 0) - COALESCE(${requestsTable.pledge_paid}, 0)), 0)::float8`,
      })
      .from(requestsTable)
      .where(
        sql`${requestsTable.payment_type} = 'pay_it_forward'
          AND ${requestsTable.status} = 'completed'
          AND COALESCE(${requestsTable.pledge_paid}, 0) < COALESCE(${requestsTable.pledge_amount}, 0)`
      );

    const [enabled, guaranteed_minimum, [pendingTotals]] = await Promise.all([
      isPoolEnabled(),
      getGuaranteedMinimum(),
      db
        .select({
          pending_minimums_count: sql<number>`COUNT(*)::int`,
          pending_minimums_total: sql<number>`COALESCE(SUM(${poolPendingMinimumsTable.amount}), 0)::float8`,
        })
        .from(poolPendingMinimumsTable)
        .where(eq(poolPendingMinimumsTable.status, "pending")),
    ]);

    const balance = totals?.balance ?? 0;
    const outflow_30d = totals?.outflow_30d ?? 0;
    // Runway = how many days the pool sustains at current 30-day burn rate.
    // null = infinite runway (nothing spent in the last 30 days).
    const daily_burn = outflow_30d / 30;
    const runway_days = daily_burn > 0 ? Math.round(balance / daily_burn) : null;

    res.json({
      enabled,
      guaranteed_minimum,
      balance,
      total_contributed: totals?.total_contributed ?? 0,
      total_fronted: totals?.total_fronted ?? 0,
      total_repaid: totals?.total_repaid ?? 0,
      total_minimums: totals?.total_minimums ?? 0,
      helpers_fronted: totals?.helpers_fronted ?? 0,
      sponsor_count: totals?.sponsor_count ?? 0,
      pending_minimums_count: pendingTotals?.pending_minimums_count ?? 0,
      pending_minimums_total: pendingTotals?.pending_minimums_total ?? 0,
      // Runway metrics
      inflow_30d: totals?.inflow_30d ?? 0,
      outflow_30d,
      runway_days,
      outstanding_pif_total: outstandingPif?.total ?? 0,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load pool stats");
    res.status(500).json({ error: "Failed to load pool stats" });
  }
});

/**
 * GET /pool/ledger — recent pool activity (public transparency feed).
 * Sponsor first names shown for contributions; helpers stay anonymous.
 * Explicitly rate-limited: public ledger feed can be expensive at high limit.
 */
router.get("/pool/ledger", generalApiLimiter, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query["limit"] ?? "25")) || 25, 1), 50);
    const rows = await db
      .select({
        id: communityPoolLedgerTable.id,
        entry_type: communityPoolLedgerTable.entry_type,
        amount: communityPoolLedgerTable.amount,
        request_id: communityPoolLedgerTable.request_id,
        notes: communityPoolLedgerTable.notes,
        created_at: communityPoolLedgerTable.created_at,
        user_name: usersTable.name,
      })
      .from(communityPoolLedgerTable)
      .leftJoin(usersTable, eq(communityPoolLedgerTable.user_id, usersTable.id))
      .orderBy(desc(communityPoolLedgerTable.created_at))
      .limit(limit);

    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        entry_type: r.entry_type,
        amount: r.amount,
        request_id: r.request_id,
        // Only sponsors are named (first name) — helper payouts stay anonymous
        display_name:
          r.entry_type === "sponsor_contribution" && r.user_name
            ? r.user_name.split(" ")[0]
            : null,
        notes: r.notes,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Failed to load pool ledger");
    res.status(500).json({ error: "Failed to load pool ledger" });
  }
});

/**
 * POST /pool/contribute — fund the Community Pool.
 * With Stripe configured: creates a PaymentIntent (metadata pool_contribution)
 * and returns client_secret; the webhook records the ledger entry on success.
 * Without Stripe (dev): records the contribution directly.
 */
router.post("/pool/contribute", requireAuth, paymentLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const amount = typeof req.body?.amount === "number" ? req.body.amount : NaN;

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    return res.status(400).json({ error: "amount must be between $1 and $10,000" });
  }

  try {
    if (_stripe) {
      const intent = await _stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          pool_contribution: "true",
          user_id: String(userId),
        },
      });
      return res.json({
        mode: "stripe",
        client_secret: intent.client_secret,
        payment_intent_id: intent.id,
      });
    }

    // Dev mode — no Stripe: record directly so the flow is testable end-to-end
    await recordPoolContribution({
      amount,
      userId,
      notes: "Contribution recorded without Stripe (development mode)",
    });
    // Pool was just replenished — backfill any queued guaranteed minimums
    await processPendingMinimums();
    const balance = await getPoolBalance();
    broadcast({ type: "pool_updated", payload: { balance } });
    return res.json({ mode: "recorded", balance });
  } catch (err) {
    logger.error({ err, user_id: userId }, "Pool contribution failed");
    return res.status(500).json({ error: "Contribution failed. Please try again." });
  }
});

export default router;
