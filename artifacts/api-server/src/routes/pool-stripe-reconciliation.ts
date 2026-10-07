import { Router } from "express";
import Stripe from "stripe";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { getStripeSecretKey, getStripeWebhookSecret } from "../lib/stripe-config";
import { recordPoolContributionSettlement } from "../lib/community-pool";
import { getStripeSettlementBreakdown } from "../lib/stripe-settlement";
import { scanRecentPoolContributions, POOL_STRIPE_RECONCILIATION_MAX_PAGES } from "../lib/pool-stripe-reconciliation";

const router = Router();
const STRIPE_SECRET_KEY = getStripeSecretKey();
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
      timeout: STRIPE_REQUEST_TIMEOUT_MS,
    })
  : null;

/** Safe diagnostics: exposes account identity/mode, never secrets. */
router.get("/pool/stripe/config-health", requireAdmin(), adminLimiter, async (_req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  try {
    const account = await stripe.accounts.retrieve();
    return res.json({
      configured: true,
      account_id: account.id,
      livemode: STRIPE_SECRET_KEY.startsWith("sk_live_"),
      charges_enabled: Boolean(account.charges_enabled),
      payouts_enabled: Boolean(account.payouts_enabled),
      webhook_secret_configured: Boolean(getStripeWebhookSecret()),
      app_url: process.env["APP_URL"] ?? null,
      allowed_origin: process.env["ALLOWED_ORIGIN"] ?? null,
      expected_webhook_path: "/api/stripe/webhook",
    });
  } catch (err) {
    logger.error({ err }, "pool Stripe config health check failed");
    return res.status(500).json({ error: "Stripe configuration health check failed." });
  }
});

/** Read-only transaction-level reconciliation. */
router.get("/pool/stripe/reconciliation", requireAdmin(), adminLimiter, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 90);

  try {
    const result = await scanRecentPoolContributions(
      stripe,
      days,
      POOL_STRIPE_RECONCILIATION_MAX_PAGES,
    );
    const account = await stripe.accounts.retrieve();
    return res.json({
      generated_at: new Date().toISOString(),
      lookback_days: days,
      stripe_account_id: account.id,
      ...result,
    });
  } catch (err) {
    logger.error({ err }, "Community Pool Stripe reconciliation failed");
    return res.status(500).json({ error: "Stripe reconciliation failed." });
  }
});

/**
 * Repairs an already-succeeded Pool PaymentIntent. No new charge is created.
 * The existing Stripe-PI unique index makes this safe to retry.
 */
router.post("/pool/stripe/reconciliation/:paymentIntentId/repair", requireAdmin(), adminLimiter, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  const paymentIntentId = String(req.params.paymentIntentId ?? "").trim();
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return res.status(400).json({ error: "Invalid Stripe PaymentIntent ID." });

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    if (pi.status !== "succeeded") return res.status(409).json({ error: `PaymentIntent is ${pi.status}, not succeeded.` });
    if (pi.metadata?.["pool_contribution"] !== "true") return res.status(409).json({ error: "PaymentIntent is not a Community Pool contribution." });

    const userId = Number(pi.metadata?.["user_id"]) || null;
    const communityId = Number(pi.metadata?.["community_id"]) || null;
    const isGeneralFund = pi.metadata?.["pool_destination"] === "general";
    if (communityId == null && !isGeneralFund) {
      return res.status(409).json({
        error: "PaymentIntent is missing an explicit Community Pool or General Fund destination.",
      });
    }
    const body = (req.body ?? {}) as {
      climate_contribution_cents?: number;
      stripe_climate_transaction_id?: string;
    };
    const metadataClimateCents = Number.parseInt(pi.metadata?.["climate_contribution_cents"] ?? "0", 10) || 0;
    const climateContributionCents = Number.isFinite(body.climate_contribution_cents)
      ? Math.round(body.climate_contribution_cents ?? 0)
      : metadataClimateCents;
    const climateTransactionId =
      body.stripe_climate_transaction_id?.trim() ||
      pi.metadata?.["stripe_climate_transaction_id"] ||
      null;
    const settlement = await getStripeSettlementBreakdown(stripe, pi, {
      climateContributionCents,
      climateTransactionId,
    });
    const recorded = await recordPoolContributionSettlement({
      userId,
      communityId,
      poolDestination: isGeneralFund ? "general" : undefined,
      settlement: {
        ...settlement,
      },
      notes: isGeneralFund
        ? "Reconciled anonymous donation to Niakofa General Fund"
        : "Reconciled Stripe Community Pool contribution",
    });

    logger.warn(
      {
        payment_intent_id: pi.id,
        gross_amount: settlement.grossAmountCents / 100,
        stripe_fee: settlement.stripeFeeCents / 100,
        climate_contribution: settlement.climateContributionCents / 100,
        net_amount: settlement.netAmountCents / 100,
        recorded,
      },
      "Community Pool Stripe payment reconciled",
    );
    return res.json({
      repaired: recorded.recorded,
      already_recorded: recorded.alreadyRecorded,
      payment_intent_id: pi.id,
      gross_amount: settlement.grossAmountCents / 100,
      stripe_fee: settlement.stripeFeeCents / 100,
      climate_contribution: settlement.climateContributionCents / 100,
      net_amount: settlement.netAmountCents / 100,
      stripe_balance_transaction_id: settlement.stripeBalanceTransactionId,
      stripe_climate_transaction_id: settlement.stripeClimateTransactionId,
      settlement_status: settlement.settlementStatus,
      available_on: settlement.availableOn,
      user_id: userId,
      community_id: communityId,
    });
  } catch (err) {
    logger.error({ err, payment_intent_id: paymentIntentId }, "Community Pool Stripe payment repair failed");
    return res.status(500).json({ error: "Stripe payment repair failed." });
  }
});

export default router;
