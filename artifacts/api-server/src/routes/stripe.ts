import { Router } from "express";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { requireOwnership } from "../middlewares/authz";
import Stripe from "stripe";
import { db, stripeAccountsTable, paymentTransactionsTable, usersTable, requestsTable, transactionsTable, communityPoolLedgerTable, walletCashoutsTable, diasporaHubsTable, diasporaHubPledgesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { sendPushToUser } from "./push";
import { wasRequestFronted, recordPoolContributionSettlement, getPoolBalance, processPendingMinimums, syncHubReservedBalance } from "../lib/community-pool";
import { getStripeSettlementBreakdown } from "../lib/stripe-settlement";
import { logger } from "../lib/logger";
import { getStripeSecretKey, getStripeWebhookSecret } from "../lib/stripe-config";
import { paymentLimiter } from "../middlewares/rate-limit";
import { reversePoolContributionOnRefund } from "../lib/pool-contribution-refund";
import { z } from "zod";
import { executeHelperPayout } from "../lib/payout-service";

const router = Router();

const STRIPE_SECRET_KEY = getStripeSecretKey();
const STRIPE_WEBHOOK_SECRET = getStripeWebhookSecret();
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

  logger.info({ type: event.type, eventId: event.id }, "Stripe webhook event received");

  // Record receipt before business processing. This keeps delivery observability
  // independent from ledger posting and makes retry/failure gaps queryable.
  try {
    const paymentIntentId =
      event.type.startsWith("payment_intent.")
        ? ((event.data.object as Stripe.PaymentIntent).id ?? null)
        : null;
    await db.execute(sql`
      INSERT INTO stripe_webhook_events
        (stripe_event_id, event_type, livemode, payment_intent_id, processing_status)
      VALUES
        (${event.id}, ${event.type}, ${event.livemode}, ${paymentIntentId}, 'received')
      ON CONFLICT (stripe_event_id) DO NOTHING
    `);
  } catch (auditErr) {
    // Audit storage is diagnostic only. Never block a legitimate Stripe event
    // from reaching the financial processing path.
    logger.warn({ auditErr, eventId: event.id }, "Stripe webhook audit insert failed");
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        // 0. Community Pool contribution? Record the ledger entry and stop —
        // pool contributions have no payment_transactions row.
        if (pi.metadata?.["pool_contribution"] === "true") {
          const contributorId = parseInt(pi.metadata["user_id"] ?? "") || null;
          const communityId = parseInt(pi.metadata["community_id"] ?? "") || null;
          const isGeneralFund = pi.metadata?.["pool_destination"] === "general";
          if (communityId == null && !isGeneralFund && pi.metadata?.["anonymous_donation"] !== "true") {
            throw new Error(`Pool contribution ${pi.id} is missing an explicit community destination`);
          }
          const settlementIntent = await stripe!.paymentIntents.retrieve(pi.id, {
            expand: ["latest_charge"],
          });
          const climateContributionCents = Math.max(
            0,
            Number.parseInt(pi.metadata?.["climate_contribution_cents"] ?? "0", 10) || 0,
          );
          const settlement = await getStripeSettlementBreakdown(stripe!, settlementIntent, {
            climateContributionCents,
            climateTransactionId: pi.metadata?.["stripe_climate_transaction_id"] ?? null,
          });
          const recorded = await recordPoolContributionSettlement({
            userId: contributorId,
            communityId,
            poolDestination: isGeneralFund ? "general" : undefined,
            notes: isGeneralFund
              ? "Anonymous donation to Niakofa General Fund"
              : "Sponsor contribution via Stripe",
            settlement: {
              ...settlement,
            },
          });
          if (recorded.recorded) {
            // Pool replenished — backfill any queued guaranteed minimums
            await processPendingMinimums();
            const balance = await getPoolBalance();
            broadcast({ type: "pool_updated", payload: { balance } });
            logger.info(
              {
                gross_amount: settlement.grossAmountCents / 100,
                stripe_fee: settlement.stripeFeeCents / 100,
                climate_contribution: settlement.climateContributionCents / 100,
                net_amount: settlement.netAmountCents / 100,
                user_id: contributorId,
                already_recorded: recorded.alreadyRecorded,
              },
              "Community pool contribution settlement recorded",
            );
          }
          break;
        }

        // 0b. Cross-hub crisis pledge (Griot Globe)? Flip the pledge row from
        // 'pending_payment' to 'pledged' and credit the destination hub's
        // community pool. The WHERE state guard makes this idempotent —
        // webhook retries find status already 'pledged', update 0 rows, and
        // skip the ledger write below (recordPoolContribution has its own
        // stripe_payment_intent_id unique-index guard as a second backstop).
        if (pi.metadata?.["hub_pledge"] === "true") {
          const pledgeAmount = (pi.amount_received || pi.amount) / 100;

          // Gate strictly on 'pending_payment' (not just "!= 'pledged'") so a
          // 'cancelled' row can never be silently revived by a late webhook
          // retry. The status flip and the ledger credit happen in the SAME
          // transaction — if the ledger insert throws, the status update is
          // rolled back too, so a retry finds the row still 'pending_payment'
          // and can safely re-attempt crediting instead of leaving a pledge
          // marked 'pledged' with no money ever landing in the pool.
          const pledgeRow = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(diasporaHubPledgesTable)
              .set({ status: "pledged" })
              .where(and(
                eq(diasporaHubPledgesTable.stripe_payment_intent_id, pi.id),
                eq(diasporaHubPledgesTable.status, "pending_payment"),
              ))
              .returning();
            if (!row) return null;

            const [toHubRow] = await tx
              .select({ id: diasporaHubsTable.id, community_id: diasporaHubsTable.community_id })
              .from(diasporaHubsTable)
              .where(eq(diasporaHubsTable.id, row.to_hub_id));

            // Ring-fencing (migration 0057): tag the ledger row with hub_id so
            // this money can ONLY be spent on requests tagged to the same
            // destination hub — it must never bleed into the global pool or
            // fund an unrelated hub's requests, honoring the pledger's intent.
            await tx.insert(communityPoolLedgerTable).values({
              entry_type: "sponsor_contribution",
              amount: pledgeAmount,
              user_id: row.pledged_by,
              community_id: toHubRow?.community_id ?? null,
              hub_id: row.to_hub_id,
              stripe_payment_intent_id: pi.id,
              notes: `Cross-hub crisis pledge to hub #${row.to_hub_id} (ring-fenced)`,
            });

            await syncHubReservedBalance(row.to_hub_id, tx);

            return row;
          });

          if (!pledgeRow) {
            logger.info({ pi: pi.id }, "hub_pledge webhook: no pending pledge row — retry, already processed, or unknown intent, skipping");
            break;
          }

          const [toHub] = await db
            .select({ id: diasporaHubsTable.id, name: diasporaHubsTable.name, community_id: diasporaHubsTable.community_id })
            .from(diasporaHubsTable)
            .where(eq(diasporaHubsTable.id, pledgeRow.to_hub_id));

          const [fromHub] = await db
            .select({ name: diasporaHubsTable.name })
            .from(diasporaHubsTable)
            .where(eq(diasporaHubsTable.id, pledgeRow.from_hub_id));

          await processPendingMinimums();

          broadcast({
            type: "crisis_update",
            payload: {
              hub_id: pledgeRow.to_hub_id,
              name: toHub?.name,
              pledge: { from_hub: fromHub?.name, amount: pledgeAmount, confirmed: true },
            },
          });

          logger.info(
            { pledge_id: pledgeRow.id, amount: pledgeAmount, to_hub_id: pledgeRow.to_hub_id },
            "hub pledge: payment confirmed and pool credited"
          );
          break;
        }

        // 1. Flip the payment_transactions row to completed — the state guard
        // makes this the idempotency gate: webhook retries find state already
        // "completed", get no row back, and skip every side effect below.
        const [txRow] = await db
          .update(paymentTransactionsTable)
          .set({ state: "completed", updated_at: new Date() })
          .where(and(
            eq(paymentTransactionsTable.stripe_payment_intent_id, pi.id),
            sql`${paymentTransactionsTable.state} != 'completed'`
          ))
          .returning();

        if (!txRow) {
          // Already processed (retry) or no matching transaction — nothing to do
          logger.info({ pi: pi.id }, "payment_intent.succeeded: no unprocessed transaction row — skipping");
          break;
        }

        // 2. Full ledger sync for Pay It Forward pledges

        if (
          txRow &&
          txRow.payment_type === "pay_it_forward" &&
          txRow.request_id &&
          txRow.helper_id
        ) {
          const amount = Math.round(txRow.amount * 100) / 100;
          const requestId = txRow.request_id;
          const helperId = txRow.helper_id;

          // Was this request's helper already paid up-front by the Community
          // Pool? If so, the requester's repayment replenishes the POOL — the
          // helper must NOT be credited a second time.
          const fronted = await wasRequestFronted(requestId);

          // All money mutations in ONE transaction so a mid-sequence failure
          // can't leave pledge_paid bumped without the matching ledger writes.
          await db.transaction(async (tx) => {
            await tx
              .update(requestsTable)
              .set({ pledge_paid: sql`COALESCE(${requestsTable.pledge_paid}, 0) + ${amount}` })
              .where(eq(requestsTable.id, requestId));

            if (fronted) {
              const [frontLedger] = await tx
                .select({
                  community_id: communityPoolLedgerTable.community_id,
                  hub_id: communityPoolLedgerTable.hub_id,
                })
                .from(communityPoolLedgerTable)
                .where(and(
                  eq(communityPoolLedgerTable.request_id, requestId),
                  eq(communityPoolLedgerTable.entry_type, "helper_front"),
                ))
                .limit(1);
              if (!frontLedger || (frontLedger.community_id == null && frontLedger.hub_id == null)) {
                throw new Error(`Pool-fronted request ${requestId} is missing a fund scope`);
              }
              // Repayment flows back into the pool. onConflictDoNothing +
              // unique index on stripe_payment_intent_id = retry-safe.
              await tx
                .insert(communityPoolLedgerTable)
                .values({
                  entry_type: "pledge_repayment",
                  amount,
                  request_id: requestId,
                  user_id: txRow.requester_id ?? null,
                  community_id: frontLedger.community_id,
                  hub_id: frontLedger.hub_id,
                  stripe_payment_intent_id: pi.id,
                  notes: "Requester repaid a pool-fronted pledge — pool replenished",
                })
                .onConflictDoNothing();
            } else {
              // Credit benevolence_wallet for the helper
              // (benevolence_wallet = goodwill pot: pledges, sponsorships, tips — NOT job earnings)
              await tx
                .update(usersTable)
                .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amount}` })
                .where(eq(usersTable.id, helperId));

              // Ledger: helper received a pledge
              await tx.insert(transactionsTable).values({
                user_id: helperId,
                request_id: requestId,
                type: "pledge_received",
                amount,
                description: "Niakofa contribution (Stripe)",
              });
            }

            // Ledger: requester sent a pledge (either way — they paid)
            if (txRow.requester_id) {
              await tx.insert(transactionsTable).values({
                user_id: txRow.requester_id,
                request_id: requestId,
                type: "pledge_sent",
                amount: -amount,
                description: fronted
                  ? "Niakofa contribution (Stripe) — replenished the Community Pool"
                  : "Niakofa contribution (Stripe)",
              });
            }
          });

          // Requester reputation boost for honouring their pledge on time.
          // +2 trust points (capped at 80 — same ceiling as helper completions).
          // Runs OUTSIDE the main transaction so a trust-score write failure
          // never rolls back the financial records.
          if (txRow.requester_id) {
            await db
              .update(usersTable)
              .set({
                trust_score: sql`LEAST(80, COALESCE(${usersTable.trust_score}, 0) + 2)`,
              })
              .where(eq(usersTable.id, txRow.requester_id));
            logger.info(
              { requester_id: txRow.requester_id, request_id: requestId },
              "trust_score +2 for voluntary pledge repayment",
            );
          }

          if (fronted) {
            // Pool replenished — backfill any queued guaranteed minimums
            await processPendingMinimums();
            const balance = await getPoolBalance();
            broadcast({ type: "pool_updated", payload: { balance } });
            logger.info(
              { request_id: requestId, amount },
              "Fronted pledge repaid — community pool replenished (helper already paid)"
            );
          }

          // Fetch the request title so the NotificationsDrawer can render it
          let requestTitle = "a community request";
          try {
            const [reqRow] = await db
              .select({ title: requestsTable.title })
              .from(requestsTable)
              .where(eq(requestsTable.id, txRow.request_id))
              .limit(1);
            if (reqRow?.title) requestTitle = reqRow.title;
          } catch { /* non-fatal */ }

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

          // Push notification to the helper so they know money arrived.
          // Skip when the pool fronted the payment — the helper was already
          // paid and notified at completion; this repayment went to the pool.
          if (!fronted) {
            sendPushToUser(txRow.helper_id, {
              title: "💙 Niakofa Received",
              body: `$${amount.toFixed(2)} was paid forward for: "${requestTitle}". Check your Goodwill Fund.`,
              requestId: txRow.request_id,
              notifType: "wallet" as const,
            }).catch(err => logger.warn({ err, helper_id: txRow.helper_id }, "sendPushToUser (wallet): non-critical side effect failed — continuing"));
          }
        } else if (
          txRow &&
          txRow.payment_type === "tip" &&
          txRow.request_id &&
          txRow.helper_id
        ) {
          // Tips: only ever credited here, after Stripe confirms the charge
          // actually succeeded. The client-facing /requests/:id/tip endpoint
          // no longer credits directly — see requests.ts.
          const amount = txRow.amount;

          await db
            .update(usersTable)
            .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amount}` })
            .where(eq(usersTable.id, txRow.helper_id));

          await db.insert(transactionsTable).values({
            user_id: txRow.helper_id,
            request_id: txRow.request_id,
            type: "tip_received",
            amount,
            description: "Tip received (Stripe)",
          });

          if (txRow.requester_id) {
            await db.insert(transactionsTable).values({
              user_id: txRow.requester_id,
              request_id: txRow.request_id,
              type: "tip_sent",
              amount: -amount,
              description: "Tip sent (Stripe)",
            });
          }

          broadcast({
            type: "tip_paid",
            payload: {
              request_id: txRow.request_id,
              helper_id: txRow.helper_id,
              requester_id: txRow.requester_id ?? null,
              amount,
            },
          });

          sendPushToUser(txRow.helper_id, {
            title: "💚 Tip Received",
            body: `You got a $${amount.toFixed(2)} tip! Check your Goodwill Fund.`,
            requestId: txRow.request_id,
            notifType: "wallet" as const,
          }).catch(err => logger.warn({ err, helper_id: txRow.helper_id }, "sendPushToUser (tip): non-critical side effect failed — continuing"));
        } else {
          broadcast({
            type: "payment_completed",
            payload: { paymentIntentId: pi.id, amount: pi.amount / 100 },
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;

        if (pi.metadata?.["hub_pledge"] === "true") {
          const [cancelled] = await db
            .update(diasporaHubPledgesTable)
            .set({ status: "cancelled" })
            .where(and(
              eq(diasporaHubPledgesTable.stripe_payment_intent_id, pi.id),
              sql`${diasporaHubPledgesTable.status} = 'pending_payment'`,
            ))
            .returning();
          if (cancelled) {
            logger.info({ pledge_id: cancelled.id, pi: pi.id }, "hub pledge: payment failed, pledge cancelled");
          }
          break;
        }

        await db
          .update(paymentTransactionsTable)
          .set({ state: "failed", updated_at: new Date() })
          .where(eq(paymentTransactionsTable.stripe_payment_intent_id, pi.id));
        break;
      }

      case "transfer.created": {
        const transfer = event.data.object as Stripe.Transfer;
        if (transfer.destination) {
          // Stripe may deliver transfer.created before the application has
          // written stripe_transfer_id to payment_transactions. When the
          // transfer was funded by a charge, resolve the source charge back to
          // its PaymentIntent so the webhook can still link the payout row.
          const sourceTransaction = transfer.source_transaction;
          let paymentIntentId: string | null = null;

          try {
            const sourceCharge =
              typeof sourceTransaction === "string"
                ? await stripe!.charges.retrieve(sourceTransaction)
                : sourceTransaction;
            const paymentIntent = sourceCharge?.payment_intent;
            paymentIntentId =
              typeof paymentIntent === "string"
                ? paymentIntent
                : paymentIntent?.id ?? null;
          } catch (err) {
            logger.warn(
              { err, transfer_id: transfer.id, source_transaction: sourceTransaction },
              "transfer.created: source charge lookup failed — falling back to transfer ID",
            );
          }

          await db
            .update(paymentTransactionsTable)
            .set({
              stripe_transfer_id: transfer.id,
              updated_at: new Date(),
            })
            .where(
              eq(
                paymentIntentId
                  ? paymentTransactionsTable.stripe_payment_intent_id
                  : paymentTransactionsTable.stripe_transfer_id,
                paymentIntentId ?? transfer.id,
              ),
            );

          // NOTE: wallet_cashouts state transitions are handled exclusively by
          // the POST /wallet/cashout route (Phase 3) and cashout-worker.ts.
          // We deliberately do NOT mutate wallet_cashouts here to avoid racing
          // with those paths, which could cause duplicate ledger entries or
          // missed wallet decrements. Only record the transfer_id for audit.
          if (transfer.metadata?.["source"] === "benevolence_wallet" && transfer.metadata?.["cashout_id"]) {
            await db
              .update(walletCashoutsTable)
              .set({ stripe_transfer_id: transfer.id, updated_at: new Date() })
              .where(eq(walletCashoutsTable.id, parseInt(transfer.metadata["cashout_id"])));
          }
        }
        break;
      }

      case "transfer.reversed": {
        // A Stripe-side reversal (e.g. insufficient platform balance, fraud) —
        // mark the cashout row as reversed and refund the helper's wallet.
        // Guard: WHERE state='completed' makes this idempotent — duplicate
        // webhook deliveries find state already 'reversed' → 0 rows → skip all
        // downstream effects.
        const transfer = event.data.object as Stripe.Transfer;
        if (transfer.metadata?.["source"] === "benevolence_wallet" && transfer.metadata?.["cashout_id"]) {
          const cashoutId = parseInt(transfer.metadata["cashout_id"]);
          const amountDollars = transfer.amount_reversed / 100;

          // user_id from metadata — fall back to DB lookup if missing or zero.
          // Transfers created by the reconciliation cron (older versions) or cases
          // where Stripe truncated metadata may omit user_id. Without it the wallet
          // can never be restored on reversal.
          let userId = parseInt(transfer.metadata["user_id"] ?? "0") || 0;
          if (!userId && cashoutId) {
            try {
              const [cashoutRow] = await db
                .select({ user_id: walletCashoutsTable.user_id })
                .from(walletCashoutsTable)
                .where(eq(walletCashoutsTable.id, cashoutId))
                .limit(1);
              userId = cashoutRow?.user_id ?? 0;
            } catch (lookupErr) {
              logger.error({ lookupErr, cashout_id: cashoutId }, "stripe webhook: transfer.reversed user_id lookup failed");
            }
          }

          if (cashoutId && userId && amountDollars > 0) {
            let stateTransitionSucceeded = false;

            await db.transaction(async (tx) => {
              // Idempotency guard: only apply if row is still in 'completed' state.
              // Duplicate webhook deliveries will find 'reversed' → return 0 rows → skip.
              const [updated] = await tx
                .update(walletCashoutsTable)
                .set({ state: "reversed", updated_at: new Date(), notes: "Reversed by Stripe" })
                .where(and(
                  eq(walletCashoutsTable.id, cashoutId),
                  sql`${walletCashoutsTable.state} = 'completed'`
                ))
                .returning({ id: walletCashoutsTable.id });

              if (!updated) {
                // Already reversed or not in expected state — safe no-op
                logger.info(
                  { cashout_id: cashoutId, transfer_id: transfer.id },
                  "stripe webhook: transfer.reversed — cashout already reversed or not completed, skipping"
                );
                return;
              }

              stateTransitionSucceeded = true;

              // Refund the wallet only when the state transition succeeded
              await tx
                .update(usersTable)
                .set({
                  benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amountDollars}`,
                })
                .where(eq(usersTable.id, userId));

              await tx.insert(transactionsTable).values({
                user_id: userId,
                type: "goodwill" as const,
                amount: amountDollars,
                description: `Cashout reversed by Stripe — balance restored (transfer ${transfer.id})`,
              });
            });

            if (stateTransitionSucceeded) {
              broadcast({
                type: "wallet_cashout_reversed",
                payload: { user_id: userId, cashout_id: cashoutId, amount: amountDollars },
              });

              logger.warn(
                { cashout_id: cashoutId, user_id: userId, transfer_id: transfer.id, amount: amountDollars },
                "stripe webhook: cashout transfer reversed — wallet balance restored"
              );
            }
          }
        }
        break;
      }

      case "charge.refunded": {
        // A Stripe charge was refunded. Update the payment_transactions row
        // and the associated help_request so the system reflects the refund.
        // Stripe sends cumulative amount_refunded values. The row-level
        // transaction below records that cumulative watermark and applies only
        // the newly refunded delta to the helper wallet/pool ledger.
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
        if (!piId) break;

        // Pool contributions do not have a payment_transactions row. Stripe's
        // amount_refunded is cumulative, so the helper reverses only the
        // incremental net amount and remains safe for partial refund updates.
        const poolRefund = await reversePoolContributionOnRefund({
          stripePaymentIntentId: piId,
          amountRefundedCents: charge.amount_refunded,
          chargeAmountCents: charge.amount,
          refundIdempotencyKey: `refund:${charge.id}:${charge.amount_refunded}`,
        });
        if (poolRefund.reversed) {
          const balance = await getPoolBalance();
          broadcast({ type: "pool_updated", payload: { balance } });
          logger.warn(
            { pi: piId, charge: charge.id, net_reversed: poolRefund.netReversedDollars },
            "Community Pool contribution refunded — net reversed from ledger",
          );
        }

        const refundAmountCents = Math.max(0, Number(charge.amount_refunded) || 0);
        const chargeAmountCents = Math.max(0, Number(charge.amount) || 0);

        const refundResult = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(paymentTransactionsTable)
            .where(eq(paymentTransactionsTable.stripe_payment_intent_id, piId))
            .limit(1);

          if (!existing) return null;

          const priorRefundedCents = Math.round((existing.amount_refunded ?? 0) * 100);
          const incrementalRefundCents = Math.max(0, refundAmountCents - priorRefundedCents);
          if (incrementalRefundCents <= 0) return null;

          const fullyRefunded = chargeAmountCents > 0 && refundAmountCents >= chargeAmountCents;
          const [updated] = await tx
            .update(paymentTransactionsTable)
            .set({
              amount_refunded: refundAmountCents / 100,
              state: fullyRefunded ? "failed" : "disputed",
              updated_at: new Date(),
            })
            .where(and(
              eq(paymentTransactionsTable.id, existing.id),
              sql`${paymentTransactionsTable.amount_refunded} < ${refundAmountCents / 100}`,
            ))
            .returning();

          if (!updated) return null;

          const incrementalRefund = incrementalRefundCents / 100;
          // Pay-it-forward repayments and tips credit the helper's goodwill
          // wallet only after Stripe success. Reverse that credit on refund.
          // The ledger idempotency key is unique per cumulative Stripe refund
          // watermark, so partial refunds and webhook retries are safe.
          if (
            existing.helper_id &&
            (existing.payment_type === "pay_it_forward" || existing.payment_type === "tip")
          ) {
            const fronted = await wasRequestFronted(existing.request_id);
            if (!fronted) {
              await tx
                .update(usersTable)
                .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} - ${incrementalRefund}` })
                .where(eq(usersTable.id, existing.helper_id));

              await tx
                .insert(transactionsTable)
                .values({
                  user_id: existing.helper_id,
                  request_id: existing.request_id,
                  type: existing.payment_type === "tip" ? "tip_refunded" : "goodwill",
                  amount: -incrementalRefund,
                  description: `Stripe refund reversed helper wallet credit (${piId})`,
                  idempotency_key: `stripe-refund:${piId}:${refundAmountCents}`,
                  metadata: {
                    kind: "stripe_payment_refund",
                    payment_intent_id: piId,
                    charge_id: charge.id,
                    refunded_cents: refundAmountCents,
                  },
                })
                .onConflictDoNothing();
            } else {
              const [frontLedger] = await tx
                .select({
                  community_id: communityPoolLedgerTable.community_id,
                  hub_id: communityPoolLedgerTable.hub_id,
                })
                .from(communityPoolLedgerTable)
                .where(and(
                  eq(communityPoolLedgerTable.request_id, existing.request_id),
                  eq(communityPoolLedgerTable.entry_type, "helper_front"),
                ))
                .limit(1);
              if (!frontLedger || (frontLedger.community_id == null && frontLedger.hub_id == null)) {
                throw new Error(`Refund for pool-fronted request ${existing.request_id} is missing a fund scope`);
              }
              await tx
                .insert(communityPoolLedgerTable)
                .values({
                  entry_type: "pledge_repayment",
                  amount: -incrementalRefund,
                  request_id: existing.request_id,
                  user_id: existing.requester_id ?? null,
                  community_id: frontLedger.community_id,
                  hub_id: frontLedger.hub_id,
                  stripe_payment_intent_id: `refund:${charge.id}:${refundAmountCents}`,
                  notes: "Refund reversed from pool (Stripe charge.refunded)",
                })
                .onConflictDoNothing();
            }
          }

          return {
            txRow: updated,
            incrementalRefund,
            fullyRefunded,
          };
        });

        if (!refundResult) {
          logger.info({ pi: piId }, "charge.refunded: no unprocessed transaction row — skipping");
          break;
        }

        const { txRow, incrementalRefund, fullyRefunded } = refundResult;

        // Update the help_request status if the request was completed
        const [reqRow] = await db
          .select({ status: requestsTable.status, title: requestsTable.title })
          .from(requestsTable)
          .where(eq(requestsTable.id, txRow.request_id))
          .limit(1);

        if (fullyRefunded && reqRow && reqRow.status === "completed") {
          await db
            .update(requestsTable)
            .set({
              status: "cancelled",
              cancelled_at: new Date(),
            })
            .where(eq(requestsTable.id, txRow.request_id));
        }

        broadcast({
          type: "payment_refunded",
          payload: {
            request_id: txRow.request_id,
            amount: incrementalRefund,
            payment_intent_id: piId,
          },
        });

        logger.warn(
          { request_id: txRow.request_id, pi: piId, amount: incrementalRefund, cumulative_amount: refundAmountCents / 100 },
          "Stripe charge refunded — payment marked failed, request cancelled"
        );
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
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
        break;
      }

      default:
        break;
    }
  } catch (err) {
    logger.error({ err, eventType: event.type }, "Error processing Stripe webhook event");
    try {
      await db.execute(sql`
        UPDATE stripe_webhook_events
        SET processing_status = 'failed',
            error_message = ${err instanceof Error ? err.message : "Unknown webhook processing error"}
        WHERE stripe_event_id = ${event.id}
      `);
    } catch (auditErr) {
      logger.warn({ auditErr, eventId: event.id }, "Stripe webhook failure audit update failed");
    }

    // Do not acknowledge a Stripe event when financial processing failed.
    // HTTP 500 tells Stripe to retry instead of permanently losing the event.
    return res.status(500).json({
      received: false,
      error: "Webhook processing failed; Stripe should retry.",
    });
  }

  try {
    await db.execute(sql`
      UPDATE stripe_webhook_events
      SET processing_status = 'processed',
          processed_at = NOW()
      WHERE stripe_event_id = ${event.id}
    `);
  } catch (auditErr) {
    logger.warn({ auditErr, eventId: event.id }, "Stripe webhook success audit update failed");
  }

  return res.json({ received: true });
});

// ── PAYMENT INTENT (Phase 1 — immediate pay) ────────────────────────────────
// Creating a charge is still a money-moving action. Keep suspended, banned,
// and unapproved accounts from creating new payment intents even though this
// route charges the requester rather than paying a helper.
router.post("/stripe/payment-intent", requireAuth, requireApproved, requireOwnership("requesterId"), paymentLimiter, async (req, res) => {
  if (!stripeRequired(res)) return;

  const parsedBody = z.object({
    requestId: z.number().int().positive(),
    amount: z.number().finite().min(0.5).max(10000),
    helperId: z.number().int().positive().optional(),
    paymentType: z.enum(["immediate", "pay_it_forward", "tip"]).optional(),
  }).safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error: "requestId, amount, and optional helperId/paymentType are invalid",
      details: parsedBody.error.flatten().fieldErrors,
    });
  }
  const { requestId, amount, helperId, paymentType } = parsedBody.data;

  // Cross-check the client-sent amount/request against the request's own stored
  // state — requireOwnership only verifies the caller IS the requester, not that
  // the amount or target helper are legitimate. Without this, a client could
  // request a PaymentIntent for one thing (e.g. a tip) that silently diverges
  // from what actually happened on the request.
  const [targetRequest] = await db
    .select({
      pay_it_forward_amount: requestsTable.pay_it_forward_amount,
      status: requestsTable.status,
      helper_id: requestsTable.helper_id,
    })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!targetRequest) {
    return res.status(404).json({ error: "Request not found" });
  }

  if (paymentType === "tip") {
    // Tips can only be created for a completed request with an assigned
    // helper, and only for that helper — never a third party.
    if (targetRequest.status !== "completed") {
      return res.status(409).json({ error: "Can only tip completed requests" });
    }
    if (!targetRequest.helper_id || helperId !== targetRequest.helper_id) {
      return res.status(400).json({ error: "helperId must match the request's assigned helper" });
    }
  } else if (
    targetRequest.pay_it_forward_amount != null &&
    Math.round(targetRequest.pay_it_forward_amount * 100) !== Math.round(amount * 100)
  ) {
    return res.status(400).json({
      error: "amount does not match the request's pay_it_forward_amount",
    });
  }

  // Check if helper has a Connect account for direct transfer
  let transferData: { destination: string } | undefined;
  // Immediate payments are platform charges and are paid out exactly once by
  // executeHelperPayout after request completion. Only tips use a destination
  // charge because they do not enter the completion payout flow.
  if (helperId && paymentType === "tip") {
    const [acct] = await db
      .select()
      .from(stripeAccountsTable)
      .where(eq(stripeAccountsTable.user_id, helperId))
      .limit(1);
    if (acct?.stripe_account_id && acct.charges_enabled) {
      transferData = { destination: acct.stripe_account_id };
    }
  }

  const pi = await stripe!.paymentIntents.create(
    {
      amount: Math.round(amount * 100), // convert to cents
      currency: "usd",
      metadata: {
        requestId: requestId.toString(),
        helperId: helperId?.toString() ?? "",
        requesterId: req.authenticatedUserId!.toString(),
        paymentType: paymentType ?? "immediate",
      },
      automatic_payment_methods: { enabled: true },
      ...(transferData ? { transfer_data: transferData } : {}),
    },
    {
      // Tips are repeatable — the same requester may tip the same completed
      // request more than once, so the key must not collide across attempts.
      // Immediate/pledge payments are still one-per-request-per-payer.
      idempotencyKey:
        paymentType === "tip"
          ? `payment-intent-tip-${requestId}-${req.authenticatedUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          : `payment-intent-${requestId}-${req.authenticatedUserId}`,
    }
  );

  // Record in payment_transactions — starts as "authorized"
  const [tx] = await db
    .insert(paymentTransactionsTable)
    .values({
      request_id: requestId,
      helper_id: helperId ?? null,
      requester_id: req.authenticatedUserId!,
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
// BUG FIX (same audit finding as requests.ts's claim/complete gap): a
// suspended or banned user could previously still start Stripe Connect
// onboarding (identity + bank account collection) and receive payouts.
// Added requireApproved.
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
  const userId = parseInt(String(req.params.userId), 10);
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
        statusSource: "stripe",
        statusStale: false,
      });
    } catch (err) {
      logger.warn({ err, user_id: userId }, "Could not refresh Stripe Connect status — returning explicitly stale database state");
    }
  }

  return res.json({
    connected: true,
    chargesEnabled: acct.charges_enabled,
    payoutsEnabled: acct.payouts_enabled,
    detailsSubmitted: acct.details_submitted,
    accountId: acct.stripe_account_id,
    statusSource: "database",
    statusStale: Boolean(stripe),
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
  const userId = parseInt(String(req.params.userId), 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  const txs = await db
    .select()
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.requester_id, userId))
    .orderBy(paymentTransactionsTable.created_at);

  return res.json(txs);
});

// ── PAYOUT TO HELPER (called after request completion) ─────────────────────
// BUG FIX: same gap as connect/onboard above — added requireApproved.
// SECURITY FIX: never trust the client-sent amount. When a requestId is provided,
// the payout amount must match the authoritative request record (95% of the
// request's pay_it_forward_amount after the 5% platform fee). Mismatches are
// rejected with a clear error. requestId is required so every payout has a
// verifiable source of truth in the DB.
router.post("/stripe/payout", requireAuth, requireApproved, requireOwnership("helperId"), paymentLimiter, async (req, res) => {
  if (!stripeRequired(res)) return;

  const { helperId, amount, description, requestId } = req.body as {
    helperId: number;
    amount: number;
    description?: string;
    requestId?: number;
  };

  if (!helperId || !amount) return res.status(400).json({ error: "helperId and amount required" });
  if (!requestId) return res.status(400).json({ error: "requestId is required to verify payout amount" });

  // Verify the payout against the authoritative request record.
  const [request] = await db
    .select({
      id: requestsTable.id,
      helper_id: requestsTable.helper_id,
      requester_id: requestsTable.requester_id,
      payment_type: requestsTable.payment_type,
      pay_it_forward_amount: requestsTable.pay_it_forward_amount,
      status: requestsTable.status,
      title: requestsTable.title,
    })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.helper_id !== helperId) {
    return res.status(403).json({ error: "Payout helper does not match request's assigned helper" });
  }
  if (request.payment_type !== "immediate") {
    return res.status(400).json({ error: "Stripe payout is only valid for immediate-pay requests" });
  }
  if (request.status !== "completed") {
    return res.status(400).json({ error: "Request must be completed before payout" });
  }

  const grossAmount = request.pay_it_forward_amount ?? 0;
  const amountCents = Math.round(grossAmount * 100);
  const platformFeeCents = Math.round(amountCents * 0.05); // 5% platform fee
  const expectedPayoutCents = amountCents - platformFeeCents;
  const requestedCents = Math.round(amount * 100);

  if (requestedCents !== expectedPayoutCents) {
    return res.status(400).json({
      error: "Payout amount does not match the request's verified amount",
      code: "payout_amount_mismatch",
      expected_usd: (expectedPayoutCents / 100).toFixed(2),
      requested_usd: (requestedCents / 100).toFixed(2),
    });
  }

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

  const transfer = await executeHelperPayout({
    request_id: requestId,
    helper_id: helperId,
    requester_id: request.requester_id,
    amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    stripe_account_id: acct.stripe_account_id,
    request_title: description ?? request.title,
  }, 1, stripe!);

  return res.json({
    transferId: transfer.id,
    amount: transfer.amount / 100,
    destination: transfer.destination,
  });
});

export default router;
