import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  db,
  communityPoolLedgerTable,
  communityPoolFinancialEventsTable,
  poolPendingMinimumsTable,
  usersTable,
  requestsTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { paymentLimiter, generalApiLimiter, adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { broadcast } from "../lib/ws-hub";
import {
  getPoolBalance,
  getGuaranteedMinimum,
  getHourlyMinimumRate,
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

export function canRecordPoolContributionWithoutStripe(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}

function getPoolIdempotencyKey(rawKey: string | undefined): string {
  const key = rawKey?.trim();
  // A missing key must never collapse separate contributions into one Stripe
  // PaymentIntent. The frontend supplies a stable key for each user attempt;
  // this random fallback protects direct API clients from cross-payment reuse.
  return key && key.length <= 255 ? key : randomUUID();
}

/**
 * GET /pool/stats — public transparency stats for the Community Pool.
 * Explicitly rate-limited: this endpoint runs several aggregate SUM queries.
 */
router.get("/pool/stats", generalApiLimiter, async (_req, res) => {
  try {
    const [totals] = await db
      .select({
        balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8`,
        total_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN COALESCE(${communityPoolFinancialEventsTable.gross_amount_cents} / 100.0, ${communityPoolLedgerTable.amount}) ELSE 0 END), 0)::float8`,
        net_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN COALESCE(${communityPoolFinancialEventsTable.net_amount_cents} / 100.0, ${communityPoolLedgerTable.amount}) ELSE 0 END), 0)::float8`,
        stripe_fees: sql<number>`COALESCE(SUM(${communityPoolFinancialEventsTable.stripe_fee_cents}), 0)::float8 / 100`,
        climate_contributions: sql<number>`COALESCE(SUM(${communityPoolFinancialEventsTable.climate_contribution_cents}), 0)::float8 / 100`,
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
        // Weekly transparency stats — "good people paid every day" promise.
        // helpers_earned_7d: total paid out to helpers in last 7 days.
        // helpers_paid_7d: count of unique helpers who received a payment this week.
        helpers_earned_7d: sql<number>`COALESCE(ABS(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '7 days' THEN ${communityPoolLedgerTable.amount} ELSE 0 END)), 0)::float8`,
        helpers_paid_7d: sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} IN ('helper_front','guaranteed_minimum') AND ${communityPoolLedgerTable.created_at} > NOW() - INTERVAL '7 days' THEN ${communityPoolLedgerTable.user_id} END)::int`,
      })
      .from(communityPoolLedgerTable)
      .leftJoin(
        communityPoolFinancialEventsTable,
        eq(communityPoolFinancialEventsTable.community_pool_ledger_id, communityPoolLedgerTable.id),
      );

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

    const [enabled, guaranteed_minimum, minimum_hourly_rate, [pendingTotals]] = await Promise.all([
      isPoolEnabled(),
      getGuaranteedMinimum(),     // flat per-task floor
      getHourlyMinimumRate(),     // per-hour rate (scales with estimated_hours)
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
      minimum_hourly_rate,
      balance,
      total_contributed: totals?.total_contributed ?? 0,
       net_contributed: totals?.net_contributed ?? totals?.total_contributed ?? 0,
       stripe_fees: totals?.stripe_fees ?? 0,
       climate_contributions: totals?.climate_contributions ?? 0,
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
      // Weekly transparency — "good people paid every day" promise
      helpers_earned_7d: totals?.helpers_earned_7d ?? 0,
      helpers_paid_7d: totals?.helpers_paid_7d ?? 0,
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
        gross_amount_cents: communityPoolFinancialEventsTable.gross_amount_cents,
        stripe_fee_cents: communityPoolFinancialEventsTable.stripe_fee_cents,
        climate_contribution_cents: communityPoolFinancialEventsTable.climate_contribution_cents,
        net_amount_cents: communityPoolFinancialEventsTable.net_amount_cents,
        settlement_status: communityPoolFinancialEventsTable.settlement_status,
        available_on: communityPoolFinancialEventsTable.available_on,
        stripe_balance_transaction_id: communityPoolFinancialEventsTable.stripe_balance_transaction_id,
         stripe_climate_transaction_id: communityPoolFinancialEventsTable.stripe_climate_transaction_id,
      })
      .from(communityPoolLedgerTable)
      .leftJoin(usersTable, eq(communityPoolLedgerTable.user_id, usersTable.id))
      .leftJoin(
        communityPoolFinancialEventsTable,
        eq(communityPoolFinancialEventsTable.community_pool_ledger_id, communityPoolLedgerTable.id),
      )
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
        gross_amount_cents: r.gross_amount_cents,
        stripe_fee_cents: r.stripe_fee_cents,
        climate_contribution_cents: r.climate_contribution_cents,
        net_amount_cents: r.net_amount_cents,
        settlement_status: r.settlement_status,
        available_on: r.available_on,
        stripe_balance_transaction_id: r.stripe_balance_transaction_id,
         stripe_climate_transaction_id: r.stripe_climate_transaction_id,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Failed to load pool ledger");
    res.status(500).json({ error: "Failed to load pool ledger" });
  }
});

/**
 * GET /pool/my-stats — authenticated member view of their assigned Community Pool.
 *
 * The public /pool/stats endpoint remains a platform-wide transparency view;
 * this endpoint keeps a member's Pool tab scoped to their assigned community.
 */
router.get("/pool/my-stats", requireAuth, async (req, res) => {
  try {
    const userId = req.authenticatedUserId!;
    const [member] = await db
      .select({ community_id: usersTable.community_id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const communityId = member?.community_id ?? null;
    if (communityId == null) {
      return res.status(404).json({ error: "Your account is not assigned to a Community Pool yet." });
    }

    const communityResult = await db.execute<{ name: string }>(
      sql`SELECT name FROM communities WHERE id = ${communityId} LIMIT 1`,
    );
    const communityName = communityResult.rows[0]?.name;

    const [totals] = await db
      .select({
        balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8`,
         total_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN COALESCE(${communityPoolFinancialEventsTable.gross_amount_cents} / 100.0, ${communityPoolLedgerTable.amount}) ELSE 0 END), 0)::float8`,
         net_contributed: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN COALESCE(${communityPoolFinancialEventsTable.net_amount_cents} / 100.0, ${communityPoolLedgerTable.amount}) ELSE 0 END), 0)::float8`,
         stripe_fees: sql<number>`COALESCE(SUM(${communityPoolFinancialEventsTable.stripe_fee_cents}), 0)::float8 / 100`,
         climate_contributions: sql<number>`COALESCE(SUM(${communityPoolFinancialEventsTable.climate_contribution_cents}), 0)::float8 / 100`,
        total_fronted: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'helper_front' THEN -${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        total_repaid: sql<number>`COALESCE(SUM(CASE WHEN ${communityPoolLedgerTable.entry_type} = 'pledge_repayment' THEN ${communityPoolLedgerTable.amount} ELSE 0 END), 0)::float8`,
        sponsor_count: sql<number>`COUNT(DISTINCT CASE WHEN ${communityPoolLedgerTable.entry_type} = 'sponsor_contribution' THEN ${communityPoolLedgerTable.user_id} END)::int`,
      })
      .from(communityPoolLedgerTable)
      .leftJoin(
        communityPoolFinancialEventsTable,
        eq(communityPoolFinancialEventsTable.community_pool_ledger_id, communityPoolLedgerTable.id),
      )
      .where(eq(communityPoolLedgerTable.community_id, communityId));

    const balance = totals?.balance ?? 0;
    const target = 500;
    return res.json({
      community_id: communityId,
      community_name: communityName ?? "Your Community",
      balance,
      total_contributed: totals?.total_contributed ?? 0,
      net_contributed: totals?.net_contributed ?? totals?.total_contributed ?? 0,
      stripe_fees: totals?.stripe_fees ?? 0,
      climate_contributions: totals?.climate_contributions ?? 0,
      total_fronted: totals?.total_fronted ?? 0,
      total_repaid: totals?.total_repaid ?? 0,
      sponsor_count: totals?.sponsor_count ?? 0,
      pool_pct: Math.max(0, Math.min(Math.round((balance / target) * 100), 100)),
      target_reserve_amount: target,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load member Community Pool stats");
    return res.status(500).json({ error: "Failed to load your Community Pool" });
  }
});

/** Recent activity for the authenticated member's Community Pool only. */
router.get("/pool/my-ledger", requireAuth, async (req, res) => {
  try {
    const userId = req.authenticatedUserId!;
    const [member] = await db
      .select({ community_id: usersTable.community_id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (member?.community_id == null) return res.json({ entries: [] });

    const limit = Math.min(Math.max(parseInt(String(req.query["limit"] ?? "25")) || 25, 1), 50);
    const rows = await db
      .select({
        id: communityPoolLedgerTable.id,
        entry_type: communityPoolLedgerTable.entry_type,
        amount: communityPoolLedgerTable.amount,
        notes: communityPoolLedgerTable.notes,
        created_at: communityPoolLedgerTable.created_at,
        gross_amount_cents: communityPoolFinancialEventsTable.gross_amount_cents,
        stripe_fee_cents: communityPoolFinancialEventsTable.stripe_fee_cents,
        climate_contribution_cents: communityPoolFinancialEventsTable.climate_contribution_cents,
        net_amount_cents: communityPoolFinancialEventsTable.net_amount_cents,
        settlement_status: communityPoolFinancialEventsTable.settlement_status,
        available_on: communityPoolFinancialEventsTable.available_on,
        stripe_balance_transaction_id: communityPoolFinancialEventsTable.stripe_balance_transaction_id,
         stripe_climate_transaction_id: communityPoolFinancialEventsTable.stripe_climate_transaction_id,
      })
      .from(communityPoolLedgerTable)
      .leftJoin(
        communityPoolFinancialEventsTable,
        eq(communityPoolFinancialEventsTable.community_pool_ledger_id, communityPoolLedgerTable.id),
      )
      .where(eq(communityPoolLedgerTable.community_id, member.community_id))
      .orderBy(desc(communityPoolLedgerTable.created_at))
      .limit(limit);
    return res.json({ entries: rows });
  } catch (err) {
    logger.error({ err }, "Failed to load member Community Pool ledger");
    return res.status(500).json({ error: "Failed to load your Community Pool activity" });
  }
});

/**
 * POST /pool/contribute — fund the Community Pool.
 * With Stripe configured: creates a PaymentIntent (metadata pool_contribution)
 * and returns client_secret; the webhook records the ledger entry on success.
 * Without Stripe (development/test only): records the contribution directly.
 */
router.post("/pool/contribute", requireAuth, paymentLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const amount = typeof req.body?.amount === "number" ? req.body.amount : NaN;

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    return res.status(400).json({ error: "amount must be between $1 and $10,000" });
  }

  try {
    // Keep the contributor's geographic attribution on the PaymentIntent so
    // the webhook can write the successful contribution into the right pool.
    const [contributor] = await db
      .select({ community_id: usersTable.community_id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const communityId = contributor?.community_id ?? null;

    if (_stripe) {
      const idempotencyKey = getPoolIdempotencyKey(req.header("Idempotency-Key"));
      const intent = await _stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          pool_contribution: "true",
          user_id: String(userId),
          community_id: communityId == null ? "" : String(communityId),
        },
      }, { idempotencyKey });
      return res.json({
        mode: "stripe",
        client_secret: intent.client_secret,
        payment_intent_id: intent.id,
      });
    }

    if (!canRecordPoolContributionWithoutStripe()) {
      return res.status(503).json({
        error: "Community Pool payments are not configured. Please try again later.",
      });
    }

    // Development/test mode — no Stripe: record directly so the flow is
    // testable end-to-end without ever crediting an unconfigured production app.
    await recordPoolContribution({
      amount,
      userId,
      communityId,
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

/**
 * POST /pool/donate — anonymous public Community Pool donation.
 *
 * No authentication required — anyone (logged-in or not) can fund the pool.
 * This is the gap identified in the product review: "pool contributions still
 * require login" limits public/grassroots funding. Anonymous donations are
 * Stripe-only (no dev-mode direct credit) to prevent abuse.
 *
 * The Stripe webhook at /stripe/webhook already handles pool_contribution=true
 * and gracefully accepts a null user_id, so no webhook changes are needed.
 */
router.post("/pool/donate", paymentLimiter, async (req, res) => {
  const amount = typeof req.body?.amount === "number" ? req.body.amount : NaN;

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    return res.status(400).json({ error: "amount must be between $1 and $10,000" });
  }

  if (!_stripe) {
    return res.status(503).json({
      error: "Anonymous donations require Stripe to be configured.",
      setup: "Ask the admin to add the STRIPE_SECRET_KEY to enable real donations.",
    });
  }

  try {
    const idempotencyKey = getPoolIdempotencyKey(req.header("Idempotency-Key"));
    const intent = await _stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        pool_contribution: "true",
        anonymous_donation: "true",
        // user_id intentionally omitted — anonymous contribution
        // The webhook handles this: parseInt("") || null → records userId as null
      },
    }, { idempotencyKey });

    logger.info({ amount, anonymous: true }, "Anonymous pool donation PaymentIntent created");

    return res.json({
      mode: "stripe",
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
    });
  } catch (err) {
    logger.error({ err }, "Anonymous pool donation failed");
    return res.status(500).json({ error: "Donation failed. Please try again." });
  }
});

/**
 * GET /admin/pool/stripe-balance
 * Compares the actual Stripe platform balance against the Community Pool ledger
 * sum so admins can detect drift between the accounting system and held funds.
 *
 * Drift is expected to be small (in-flight payouts, Stripe fees) but large gaps
 * may indicate a ledger bug, a missed webhook, or a reconciliation error.
 * The endpoint logs a structured warning when gap > $10.
 */
router.get("/admin/pool/stripe-balance", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  try {
    // Use the canonical pool helper — same value shown in the pool stats endpoint
    const ledgerBalance = await getPoolBalance();

    if (!_stripe) {
      return res.json({
        stripe_configured: false,
        ledger_balance: ledgerBalance,
        message: "Stripe is not configured — real-time balance check unavailable.",
      });
    }

    const stripeBalance = await _stripe.balance.retrieve();

    // "available" is immediately accessible; "pending" is in transit.
    // Sum USD amounts across both buckets for a full picture.
    const available = stripeBalance.available
      .filter(b => b.currency === "usd")
      .reduce((s, b) => s + b.amount, 0) / 100;

    const pending = stripeBalance.pending
      .filter(b => b.currency === "usd")
      .reduce((s, b) => s + b.amount, 0) / 100;

    const totalStripe = available + pending;
    const drift = Math.abs(totalStripe - ledgerBalance);
    const driftAlert = drift > 10; // alert threshold: $10

    if (driftAlert) {
      logger.warn(
        { stripe_available: available, stripe_pending: pending, ledger_balance: ledgerBalance, drift },
        "pool/stripe-balance: ledger vs Stripe drift exceeds $10 — review reconciliation"
      );
    }

    return res.json({
      stripe_configured: true,
      stripe_available: available,
      stripe_pending: pending,
      stripe_total: totalStripe,
      ledger_balance: ledgerBalance,
      drift,
      drift_alert: driftAlert,
      message: driftAlert
        ? `⚠️ Ledger/Stripe gap is ${drift.toFixed(2)} — review pool ledger or Stripe dashboard.`
        : `✓ Ledger and Stripe are within $10 (gap: ${drift.toFixed(2)}).`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to retrieve Stripe balance for pool reconciliation");
    return res.status(500).json({ error: "Failed to retrieve balance." });
  }
});

export default router;
