import { Router } from "express";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { requireOwnership, requireAdmin } from "../middlewares/authz";
import Stripe from "stripe";
import { db, stripeAccountsTable, paymentTransactionsTable, usersTable, requestsTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { sendPushToUser } from "./push";
import { logger } from "../lib/logger";
import { paymentLimiter } from "../middlewares/rate-limit";

const router = Router();

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
const APP_URL = process.env["APP_URL"] ?? "http://localhost:5000";

// Stripe client — null if not configured (graceful degradation)
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

function stripeRequired(res: Parameters<Parameters<typeof router.post>[1]>[1]): boolean {
  if (!stripe) {
    res.status(503).json({
      error: "Stripe is not configured.",
      setup: "Set STRIPE_SECRET_KEY environment variable to enable payment infrastructure.",
    });
    return false;
  }
  return true;
}

// ── WEBHOOK ────────────────────────────────────────────────────────────────
// NOTE: This route MUST receive the raw request body (Buffer), not parsed JSON.
// app.ts adds `express.raw({ type: "application/json" })` for /api/stripe/webhook
// before the global express.json() middleware.
router.post("/stripe/webhook", async (req, res) => {
  if (!stripeRequired(res)) return;

  const sig = req.headers["stripe-signature"] as string;
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.warn("STRIPE_WEBHOOK_SECRET not set — webhook signature verification skipped");
    return res.status(400).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });
  }
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature header" });

  let event: Stripe.Event;
  try {
    event = stripe!.webhooks.constructEvent(req.body as Buffer, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  logger.info({ eventId: event.id, type: event.type }, "Stripe webhook event received");

  // Each case is wrapped independently so one handler failure never silences others.
  // We ALWAYS return 200 — Stripe retries on non-2xx and we log failures for investigation.
  const processingErrors: { case: string; message: string }[] = [];

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      try {
        // 1. Flip the payment_transactions row to completed
        await db
          .update(paymentTransactionsTable)
          .set({ state: "completed", updated_at: new Date() })
          .where(eq(paymentTransactionsTable.stripe_payment_intent_id, pi.id));

        // 2. Full ledger sync for Pay It Forward pledges
        const [txRow] = await db
          .select()
          .from(paymentTransactionsTable)
          .where(eq(paymentTransactionsTable.stripe_payment_intent_id, pi.id))
          .limit(1);

        if (
          txRow &&
          txRow.payment_type === "pay_it_forward" &&
          txRow.request_id &&
          txRow.helper_id
        ) {
          const amount = txRow.amount;

          await db
            .update(requestsTable)
            .set({ pledge_paid: sql`COALESCE(${requestsTable.pledge_paid}, 0) + ${amount}` })
            .where(eq(requestsTable.id, txRow.request_id));

          // benevolence_wallet = goodwill pot (pledges, sponsorships, tips — NOT job earnings)
          await db
            .update(usersTable)
            .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amount}` })
            .where(eq(usersTable.id, txRow.helper_id));

          await db.insert(transactionsTable).values({
            user_id: txRow.helper_id,
            request_id: txRow.request_id,
            type: "pledge_received",
            amount,
            description: "Niakofa contribution (Stripe)",
          });

          if (txRow.requester_id) {
            await db.insert(transactionsTable).values({
              user_id: txRow.requester_id,
              request_id: txRow.request_id,
              type: "pledge_sent",
              amount: -amount,
              description: "Niakofa contribution (Stripe)",
            });
          }

          let requestTitle = "a community request";
          try {
            const [reqRow] = await db
              .select({ title: requestsTable.title })
              .from(requestsTable)
              .where(eq(requestsTable.id, txRow.request_id))
              .limit(1);
            if (reqRow?.title) requestTitle = reqRow.title;
          } catch { /* non-fatal — title is cosmetic */ }

          broadcast({
            type: "pledge_paid",
            payload: {
              request_id: txRow.request_id,
              request_title: requestTitle,
              helper_id: txRow.helper_id,
              requester_id: txRow.requester_id ?? null,
              amount,
              via: "stripe",
            },
          });

          sendPushToUser(txRow.helper_id, {
            title: "💙 Niakofa Received",
            body: `$${amount.toFixed(2)} was paid forward for: "${requestTitle}". Check your Goodwill Fund.`,
            requestId: txRow.request_id,
            notifType: "wallet" as const,
          }).catch(() => {
            // Non-fatal: payment receipt push failed — funds were still credited
          });
        } else {
          broadcast({
            type: "payment_completed",
            payload: { paymentIntentId: pi.id, amount: pi.amount / 100 },
          });
        }
      } catch (err) {
        logger.error(
          { err, eventId: event.id, paymentIntentId: pi.id, amountCents: pi.amount },
          "Stripe webhook: payment_intent.succeeded handler failed",
        );
        processingErrors.push({ case: event.type, message: err instanceof Error ? err.message : String(err) });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      try {
        await db
          .update(paymentTransactionsTable)
          .set({ state: "failed", updated_at: new Date() })
          .where(eq(paymentTransactionsTable.stripe_payment_intent_id, pi.id));
      } catch (err) {
        logger.error(
          { err, eventId: event.id, paymentIntentId: pi.id },
          "Stripe webhook: payment_intent.payment_failed handler failed",
        );
        processingErrors.push({ case: event.type, message: err instanceof Error ? err.message : String(err) });
      }
      break;
    }

    case "transfer.created": {
      // CRIT-04 fix: stripe_transfer_id hasn't been set on the row yet when this
      // event fires. Match by stripe_payment_intent_id via source_transaction
      // (Stripe populates transfer.source_transaction = the original charge ID).
      const transfer = event.data.object as Stripe.Transfer;
      try {
        if (transfer.destination && (transfer as any).source_transaction) {
          const sourceCharge = (transfer as any).source_transaction as string;
          // source_transaction is the charge ID; fetch the payment intent from it
          const charge = await stripe!.charges.retrieve(sourceCharge).catch(() => null);
          const piId = charge?.payment_intent as string | null;
          if (piId) {
            await db
              .update(paymentTransactionsTable)
              .set({
                stripe_transfer_id: transfer.id,
                state: "completed",
                updated_at: new Date(),
              })
              .where(eq(paymentTransactionsTable.stripe_payment_intent_id, piId));
          } else {
            // Fallback: store the transfer ID for manual reconciliation
            logger.warn({ transferId: transfer.id, sourceCharge }, "transfer.created: could not resolve payment_intent — storing transfer_id only");
          }
        }
      } catch (err) {
        logger.error(
          { err, eventId: event.id, transferId: transfer.id },
          "Stripe webhook: transfer.created handler failed",
        );
        processingErrors.push({ case: event.type, message: err instanceof Error ? err.message : String(err) });
      }
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      try {
        const [existing] = await db
          .select()
          .from(stripeAccountsTable)
          .where(eq(stripeAccountsTable.stripe_account_id, account.id))
          .limit(1);

        if (existing) {
          await db
            .update(stripeAccountsTable)
            .set({
              charges_enabled: account.charges_enabled,
              payouts_enabled: account.payouts_enabled,
              details_submitted: account.details_submitted,
              updated_at: new Date(),
            })
            .where(eq(stripeAccountsTable.stripe_account_id, account.id));

          if (account.payouts_enabled && !existing.payouts_enabled) {
            broadcast({
              type: "payouts_enabled",
              payload: { userId: existing.user_id },
            });
          }
        }
      } catch (err) {
        logger.error(
          { err, eventId: event.id, stripeAccountId: account.id },
          "Stripe webhook: account.updated handler failed",
        );
        processingErrors.push({ case: event.type, message: err instanceof Error ? err.message : String(err) });
      }
      break;
    }

    default:
      logger.debug({ eventId: event.id, type: event.type }, "Stripe webhook: unhandled event type (ignored)");
      break;
  }

  // Always return 200 — Stripe considers non-2xx a delivery failure and will retry.
  // Include processing errors in the response body for observability without causing retries.
  if (processingErrors.length > 0) {
    logger.warn({ processingErrors, eventId: event.id }, "Stripe webhook processed with errors");
    return res.json({ received: true, warnings: processingErrors });
  }

  return res.json({ received: true });
});

// ── PAYMENT INTENT (Phase 1 — immediate pay) ────────────────────────────────
router.post("/stripe/payment-intent", requireAuth, requireApproved, requireOwnership("requesterId"), paymentLimiter, async (req, res) => {
  if (!stripeRequired(res)) return;

  const { requestId, amount, helperId, paymentType } = req.body as {
    requestId: number;
    amount: number;
    helperId?: number;
    paymentType?: "immediate" | "pay_it_forward";
  };

  if (!requestId || !amount || amount <= 0) {
    return res.status(400).json({ error: "requestId and amount (> 0) required" });
  }

  // Check if helper has a Connect account for direct transfer
  let transferData: { destination: string } | undefined;
  if (helperId) {
    const [acct] = await db
      .select()
      .from(stripeAccountsTable)
      .where(eq(stripeAccountsTable.user_id, helperId))
      .limit(1);
    if (acct?.stripe_account_id && acct.charges_enabled) {
      transferData = { destination: acct.stripe_account_id };
    }
  }

  const pi = await stripe!.paymentIntents.create({
    amount: Math.round(amount * 100), // convert to cents
    currency: "usd",
    metadata: {
      requestId: requestId.toString(),
      helperId: helperId?.toString() ?? "",
      requesterId: (req as any).authenticatedUserId.toString(),
      paymentType: paymentType ?? "immediate",
    },
    automatic_payment_methods: { enabled: true },
    ...(transferData ? { transfer_data: transferData } : {}),
  });

  // Record in payment_transactions — starts as "authorized"
  const [tx] = await db
    .insert(paymentTransactionsTable)
    .values({
      request_id: requestId,
      helper_id: helperId ?? null,
      requester_id: (req as any).authenticatedUserId,
      amount,
      state: "authorized",
      payment_type: paymentType ?? "immediate",
      stripe_payment_intent_id: pi.id,
    })
    .returning();

  return res.json({
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    transactionId: tx.id,
  });
});

// ── STRIPE CONNECT ONBOARDING ───────────────────────────────────────────────
router.post("/stripe/connect/onboard", requireAuth, requireApproved, requireOwnership("userId"), paymentLimiter, async (req, res) => {
  if (!stripeRequired(res)) return;

  const { userId } = req.body as { userId: number };
  if (!userId) return res.status(400).json({ error: "userId required" });

  // Get user details for pre-filling
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // Find or create Connect account
  const [existing] = await db
    .select()
    .from(stripeAccountsTable)
    .where(eq(stripeAccountsTable.user_id, userId))
    .limit(1);

  let accountId: string;
  if (existing) {
    accountId = existing.stripe_account_id;
  } else {
    const account = await stripe!.accounts.create({
      type: "express",
      country: "US",
      email: user?.email,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { userId: userId.toString() },
    });
    accountId = account.id;

    await db.insert(stripeAccountsTable).values({
      user_id: userId,
      stripe_account_id: accountId,
    });
  }

  // Create account link for onboarding / re-onboarding
  const link = await stripe!.accountLinks.create({
    account: accountId,
    refresh_url: `${APP_URL}/api/stripe/connect/refresh`,
    return_url: `${APP_URL}/api/stripe/connect/return`,
    type: "account_onboarding",
  });

  await db
    .update(stripeAccountsTable)
    .set({
      onboarding_url: link.url,
      onboarding_url_expires: new Date(link.expires_at * 1000),
      updated_at: new Date(),
    })
    .where(eq(stripeAccountsTable.user_id, userId));

  return res.json({ url: link.url, expiresAt: new Date(link.expires_at * 1000) });
});

// ── CONNECT ACCOUNT STATUS ──────────────────────────────────────────────────
router.get("/stripe/connect/status/:userId", requireAuth, requireOwnership("userId"), async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  const [acct] = await db
    .select()
    .from(stripeAccountsTable)
    .where(eq(stripeAccountsTable.user_id, userId))
    .limit(1);

  if (!acct) return res.json({ connected: false });

  // Optionally sync live status from Stripe
  if (stripe) {
    try {
      const live = await stripe.accounts.retrieve(acct.stripe_account_id);
      await db
        .update(stripeAccountsTable)
        .set({
          charges_enabled: live.charges_enabled,
          payouts_enabled: live.payouts_enabled,
          details_submitted: live.details_submitted,
          updated_at: new Date(),
        })
        .where(eq(stripeAccountsTable.user_id, userId));

      return res.json({
        connected: true,
        chargesEnabled: live.charges_enabled,
        payoutsEnabled: live.payouts_enabled,
        detailsSubmitted: live.details_submitted,
        accountId: live.id,
      });
    } catch (err) {
      logger.warn({ err }, "Could not refresh Stripe Connect status");
    }
  }

  return res.json({
    connected: true,
    chargesEnabled: acct.charges_enabled,
    payoutsEnabled: acct.payouts_enabled,
    detailsSubmitted: acct.details_submitted,
    accountId: acct.stripe_account_id,
  });
});

// ── CONNECT REDIRECTS ───────────────────────────────────────────────────────
router.get("/stripe/connect/return", (_req, res) => {
  // After successful onboarding — redirect to wallet
  res.redirect("/wallet/connected");
});

router.get("/stripe/connect/refresh", (_req, res) => {
  // Onboarding link expired — redirect to wallet to restart
  res.redirect("/?stripe_refresh=1");
});

// ── PAYMENT TRANSACTIONS (for wallet display) ───────────────────────────────
router.get("/stripe/payment-transactions/:userId", requireAuth, requireOwnership("userId"), async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  const txs = await db
    .select()
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.requester_id, userId))
    .orderBy(paymentTransactionsTable.created_at);

  return res.json(txs);
});

// ── PAYOUT TO HELPER (called after request completion) ─────────────────────
router.post("/stripe/payout", requireAuth, requireAdmin(), paymentLimiter, async (req, res) => {
  if (!stripeRequired(res)) return;

  const { helperId, amount, description, requestId } = req.body as {
    helperId: number;
    amount: number;
    description?: string;
    requestId?: number;
  };

  if (!helperId || !amount) return res.status(400).json({ error: "helperId and amount required" });

  const [acct] = await db
    .select()
    .from(stripeAccountsTable)
    .where(eq(stripeAccountsTable.user_id, helperId))
    .limit(1);

  if (!acct?.payouts_enabled) {
    return res.status(400).json({
      error: "Helper has not completed Stripe Connect onboarding",
      helperConnected: false,
    });
  }

  // Create a transfer to the helper's connected account
  const transfer = await stripe!.transfers.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    destination: acct.stripe_account_id,
    description: description ?? `Niakofa — Request #${requestId}`,
    metadata: { helperId: helperId.toString(), requestId: requestId?.toString() ?? "" },
  });

  // Update payment transaction state
  if (requestId) {
    await db
      .update(paymentTransactionsTable)
      .set({ stripe_transfer_id: transfer.id, state: "completed", updated_at: new Date() })
      .where(eq(paymentTransactionsTable.request_id, requestId));
  }

  return res.json({
    transferId: transfer.id,
    amount: transfer.amount / 100,
    destination: transfer.destination,
  });
});

export default router;

