import { Router } from "express";
import Stripe from "stripe";
import { db, communityPoolLedgerTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { recordPoolContributionSettlement } from "../lib/community-pool";
import { getStripeSettlementBreakdown } from "../lib/stripe-settlement";

const router = Router();
const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;
const RECONCILIATION_MAX_PAGES = 5;
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
      webhook_secret_configured: Boolean(process.env["STRIPE_WEBHOOK_SECRET"]),
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
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const missing: Array<Record<string, unknown>> = [];
  let pagesScanned = 0;
  let truncated = false;

  try {
    let startingAfter: string | undefined;
    for (let pageNumber = 0; pageNumber < RECONCILIATION_MAX_PAGES; pageNumber += 1) {
      const page = await stripe.paymentIntents.list({
        limit: 100,
        created: { gte: since },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      pagesScanned += 1;

      for (const pi of page.data) {
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

      if (!page.has_more || page.data.length === 0) break;
      if (pageNumber === RECONCILIATION_MAX_PAGES - 1) {
        truncated = true;
        break;
      }
      startingAfter = page.data[page.data.length - 1]?.id;
    }
    const account = await stripe.accounts.retrieve();
    return res.json({
      generated_at: new Date().toISOString(),
      lookback_days: days,
      pages_scanned: pagesScanned,
      truncated,
      stripe_account_id: account.id,
      missing_ledger_count: missing.length,
      missing,
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
    const body = (req.body ?? {}) as {
      climate_contribution_cents?: number;
      stripe_climate_transaction_id?: string;
    };
    const metadataClimateCents = Number.parseInt(pi.metadata?.["climate_contribution_cents"] ?? "0", 10) || 0;
    const climateContributionCents = Math.max(
      0,
      Number.isFinite(body.climate_contribution_cents)
        ? Math.round(body.climate_contribution_cents ?? 0)
        : metadataClimateCents,
    );
    const settlement = await getStripeSettlementBreakdown(stripe, pi, { climateContributionCents });
    const recorded = await recordPoolContributionSettlement({
      userId,
      communityId,
      settlement: {
        ...settlement,
        stripeClimateTransactionId:
          body.stripe_climate_transaction_id?.trim() ||
          pi.metadata?.["stripe_climate_transaction_id"] ||
          null,
      },
      notes: "Reconciled Stripe Community Pool contribution",
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
