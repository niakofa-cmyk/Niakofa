import { Router } from "express";
import Stripe from "stripe";
import { db, communityPoolLedgerTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { recordPoolContribution } from "../lib/community-pool";

const router = Router();
const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

/** Safe diagnostics: exposes account identity/mode, never secrets. */
router.get("/pool/stripe/config-health", requireAdmin, adminLimiter, async (_req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  try {
    const account = await stripe.accounts.retrieve();
    res.json({
      configured: true,
      account_id: account.id,
      livemode: Boolean(account.livemode),
      charges_enabled: Boolean(account.charges_enabled),
      payouts_enabled: Boolean(account.payouts_enabled),
      webhook_secret_configured: Boolean(process.env["STRIPE_WEBHOOK_SECRET"]),
      app_url: process.env["APP_URL"] ?? null,
      allowed_origin: process.env["ALLOWED_ORIGIN"] ?? null,
      expected_webhook_path: "/api/stripe/webhook",
    });
  } catch (err) {
    logger.error({ err }, "pool Stripe config health check failed");
    res.status(500).json({ error: "Stripe configuration health check failed." });
  }
});

/** Read-only transaction-level reconciliation. */
router.get("/pool/stripe/reconciliation", requireAdmin, adminLimiter, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 90);
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const missing: Array<Record<string, unknown>> = [];

  try {
    for await (const pi of stripe.paymentIntents.list({ limit: 100, created: { gte: since } })) {
      if (pi.status !== "succeeded" || pi.metadata?.["pool_contribution"] !== "true") continue;
      const [ledger] = await db
        .select({ id: communityPoolLedgerTable.id })
        .from(communityPoolLedgerTable)
        .where(eq(communityPoolLedgerTable.stripe_payment_intent_id, pi.id))
        .limit(1);
      if (!ledger) {
        missing.push({
          payment_intent_id: pi.id,
          amount: (pi.amount_received || pi.amount) / 100,
          currency: pi.currency,
          status: pi.status,
          livemode: pi.livemode,
          created: pi.created,
          user_id: Number(pi.metadata?.["user_id"]) || null,
          community_id: Number(pi.metadata?.["community_id"]) || null,
          description: pi.description ?? null,
        });
      }
    }
    const account = await stripe.accounts.retrieve();
    res.json({ generated_at: new Date().toISOString(), lookback_days: days, stripe_account_id: account.id, missing_ledger_count: missing.length, missing });
  } catch (err) {
    logger.error({ err }, "Community Pool Stripe reconciliation failed");
    res.status(500).json({ error: "Stripe reconciliation failed." });
  }
});

/**
 * Repairs an already-succeeded Pool PaymentIntent. No new charge is created.
 * The existing Stripe-PI unique index makes this safe to retry.
 */
router.post("/pool/stripe/reconciliation/:paymentIntentId/repair", requireAdmin, adminLimiter, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  const paymentIntentId = String(req.params.paymentIntentId ?? "").trim();
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return res.status(400).json({ error: "Invalid Stripe PaymentIntent ID." });

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") return res.status(409).json({ error: `PaymentIntent is ${pi.status}, not succeeded.` });
    if (pi.metadata?.["pool_contribution"] !== "true") return res.status(409).json({ error: "PaymentIntent is not a Community Pool contribution." });

    const [existing] = await db
      .select({ id: communityPoolLedgerTable.id })
      .from(communityPoolLedgerTable)
      .where(eq(communityPoolLedgerTable.stripe_payment_intent_id, pi.id))
      .limit(1);
    if (existing) return res.json({ repaired: false, already_recorded: true, payment_intent_id: pi.id, amount: (pi.amount_received || pi.amount) / 100 });

    const amount = (pi.amount_received || pi.amount) / 100;
    const userId = Number(pi.metadata?.["user_id"]) || null;
    const communityId = Number(pi.metadata?.["community_id"]) || null;
    const recorded = await recordPoolContribution({ amount, userId, communityId, stripePaymentIntentId: pi.id, notes: "Reconciled Stripe Community Pool contribution" });

    logger.warn({ payment_intent_id: pi.id, amount, recorded }, "Community Pool Stripe payment reconciled");
    res.json({ repaired: Boolean(recorded), already_recorded: false, payment_intent_id: pi.id, amount, user_id: userId, community_id: communityId });
  } catch (err) {
    logger.error({ err, payment_intent_id: paymentIntentId }, "Community Pool Stripe payment repair failed");
    res.status(500).json({ error: "Stripe payment repair failed." });
  }
});

export default router;
