/**
 * Cashout Worker — Retries failed Stripe transfers from the benevolence_wallet.
 *
 * IMPORTANT: By the time a job reaches this worker, the helper's benevolence_wallet
 * has already been decremented in Phase 1 of POST /wallet/cashout. The worker's
 * job is ONLY to fire the Stripe transfer and mark the cashout row completed.
 * It MUST NOT decrement the wallet again.
 *
 * On success: marks wallet_cashouts row 'completed', inserts transactions ledger
 *             entry, broadcasts wallet_cashout WS event.
 *
 * On final failure: refunds the wallet (balance was reserved but never sent),
 *                   marks the row 'permanently_failed'.
 *
 * Retry schedule (inherited from queue config):
 *   5 min → 10 min → 20 min → 40 min → 80 min (5 attempts max).
 */
import { Worker, type Job } from "bullmq";
import Stripe from "stripe";
import {
  db,
  walletCashoutsTable,
  usersTable,
  transactionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getRedisConnection, QUEUE, type CashoutJobData } from "../lib/queue";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { isAmbiguousStripeError } from "../lib/stripe-errors";
import { buildCashoutTransferParams, cashoutIdempotencyKey } from "../lib/stripe-cashout";

async function processCashout(job: Job<CashoutJobData>): Promise<void> {
  const { cashout_id, user_id, amount_cents, stripe_account_id } = job.data;

  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
  const requestedAmount = amount_cents / 100;

  logger.info(
    { cashout_id, user_id, amount_cents, attempt: job.attemptsMade + 1 },
    "cashout-worker: processing"
  );

  // Skip if already completed or reversed — nothing left to do
  const [existing] = await db
    .select({ state: walletCashoutsTable.state })
    .from(walletCashoutsTable)
    .where(eq(walletCashoutsTable.id, cashout_id))
    .limit(1);

  if (existing?.state === "completed" || existing?.state === "reversed" || existing?.state === "permanently_failed") {
    logger.info({ cashout_id, state: existing?.state }, "cashout-worker: row in terminal state — skipping");
    return;
  }

  // Fire Stripe transfer — idempotency key `cashout-${id}` is stable across retries
  // so Stripe returns the original transfer object if already created.
  const transfer = await stripe.transfers.create(
    buildCashoutTransferParams({ cashout_id, user_id, stripe_account_id, amount_cents }),
    { idempotencyKey: cashoutIdempotencyKey(cashout_id) }
  );

  // Mark completed — state guard prevents duplicate ledger writes if concurrent
  // path (e.g. webhook) already completed the row.
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(walletCashoutsTable)
      .set({
        state: "completed",
        stripe_transfer_id: transfer.id,
        updated_at: new Date(),
        notes: `Completed on retry attempt ${job.attemptsMade + 1}`,
      })
      .where(
        sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`
      )
      .returning({ id: walletCashoutsTable.id });

    if (!updated[0]) {
      logger.info({ cashout_id, transfer_id: transfer.id }, "cashout-worker: state guard hit — row already completed");
      return;
    }

    // Ledger entry — balance was already decremented in Phase 1, not here
    await tx.insert(transactionsTable).values({
      user_id,
      type: "payout_sent",
      amount: -requestedAmount,
      description: `[Retry] Goodwill Fund cashout via Stripe (${transfer.id})`,
    });
  });

  broadcast({
    type: "wallet_cashout",
    payload: {
      user_id,
      amount: requestedAmount,
      transfer_id: transfer.id,
      retried: true,
    },
  });

  logger.info({ cashout_id, transfer_id: transfer.id }, "cashout-worker: succeeded");
}

async function handleCashoutFailure(job: Job<CashoutJobData>, err: Error): Promise<void> {
  // Only fire on final failure (not intermediate retries).
  // BullMQ increments attemptsMade after each attempt. The job is truly finished
  // when attemptsMade >= the configured attempts limit (no more retries left).
  const maxAttempts = job.opts.attempts ?? 5;
  if (job.attemptsMade < maxAttempts) return;

  const { cashout_id, user_id, amount_cents, stripe_account_id } = job.data;
  const requestedAmount = amount_cents / 100;

  logger.error(
    { cashout_id, user_id, err },
    "cashout-worker: all retries exhausted — reconciling before refund"
  );

  try {
    // Fetch the current cashout row to check for an ambiguous Stripe outcome.
    // Stripe can accept a transfer but return a timeout — in that case the
    // webhook will have recorded `stripe_transfer_id`. If it's set, Stripe
    // already sent the funds and we must NOT refund; instead mark completed.
    const [row] = await db
      .select({
        state: walletCashoutsTable.state,
        stripe_transfer_id: walletCashoutsTable.stripe_transfer_id,
      })
      .from(walletCashoutsTable)
      .where(eq(walletCashoutsTable.id, cashout_id))
      .limit(1);

    if (!row) {
      logger.error({ cashout_id }, "cashout-worker: final failure — row not found, skipping");
      return;
    }

    // Row already in a terminal state — nothing left to do
    if (row.state === "completed" || row.state === "reversed" || row.state === "permanently_failed") {
      logger.info({ cashout_id, state: row.state }, "cashout-worker: final failure — row already terminal, skipping");
      return;
    }

    // If a stripe_transfer_id is present, the transfer was sent (possibly via
    // a race between the webhook and a timeout error). Mark completed and write
    // the ledger — DO NOT refund.
    if (row.stripe_transfer_id) {
      logger.warn(
        { cashout_id, transfer_id: row.stripe_transfer_id },
        "cashout-worker: final failure but stripe_transfer_id found — transfer succeeded; marking completed"
      );

      await db.transaction(async (tx) => {
        const updated = await tx
          .update(walletCashoutsTable)
          .set({ state: "completed", updated_at: new Date(), notes: "Completed via final-failure reconciliation (transfer_id present)" })
          .where(sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`)
          .returning({ id: walletCashoutsTable.id });

        if (updated[0]) {
          await tx.insert(transactionsTable).values({
            user_id,
            type: "payout_sent",
            amount: -requestedAmount,
            description: `[Reconciled] Goodwill Fund cashout via Stripe (${row.stripe_transfer_id})`,
          });
        }
      });

      broadcast({ type: "wallet_cashout", payload: { user_id, cashout_id, amount: requestedAmount, reconciled: true } });
      return;
    }

    // Re-attempt the Stripe transfer with the same idempotency key as the
    // authoritative reconciliation check. Stripe deduplicates idempotent requests
    // and returns the existing transfer if one was already created — giving a
    // definitive answer without any list pagination ambiguity.
    //
    // Failure semantics:
    // - Transfer returned (new or cached) → Stripe sent funds, mark completed (DO NOT refund)
    // - Stripe error that is definitively NOT a duplicate (e.g. invalid_account) → refund
    // - Ambiguous error (timeout, network, etc.) → mark 'reconciliation_required' (fail-closed)
    const stripeKey = process.env["STRIPE_SECRET_KEY"];
    if (stripeKey) {
      try {
        const stripeClient = new Stripe(stripeKey, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
        const reconTransfer = await stripeClient.transfers.create(
          buildCashoutTransferParams({ cashout_id, user_id, stripe_account_id, amount_cents }),
          { idempotencyKey: cashoutIdempotencyKey(cashout_id) }
        );

        // Stripe returned a transfer (either new or the cached original) — funds sent
        logger.warn(
          { cashout_id, transfer_id: reconTransfer.id },
          "cashout-worker: idempotent Stripe call found/created transfer — marking completed, no refund"
        );
        await db.transaction(async (tx) => {
          const updated = await tx
            .update(walletCashoutsTable)
            .set({ state: "completed", stripe_transfer_id: reconTransfer.id, updated_at: new Date(), notes: "Completed via idempotent reconciliation transfer" })
            .where(sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`)
            .returning({ id: walletCashoutsTable.id });

          if (updated[0]) {
            await tx.insert(transactionsTable).values({
              user_id,
              type: "payout_sent",
              amount: -requestedAmount,
              description: `[Reconciled] Goodwill Fund cashout via Stripe (${reconTransfer.id})`,
            });
          }
        });
        broadcast({ type: "wallet_cashout", payload: { user_id, cashout_id, amount: requestedAmount, reconciled: true } });
        return;
      } catch (stripeErr: unknown) {
        const isAmbiguous = isAmbiguousStripeError(stripeErr);
        if (isAmbiguous) {
          // Fail-closed: we cannot determine whether Stripe sent the transfer.
          // Mark as 'reconciliation_required' and do NOT refund. An operator or
          // the reconciliation cron will resolve this row manually.
          logger.error(
            { stripeErr, cashout_id },
            "cashout-worker: ambiguous Stripe error during reconciliation — marking 'reconciliation_required', NO refund"
          );
          await db
            .update(walletCashoutsTable)
            .set({
              state: "reconciliation_required",
              notes: `Ambiguous Stripe error: ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`,
              updated_at: new Date(),
            })
            .where(eq(walletCashoutsTable.id, cashout_id))
            .catch(err => logger.warn({ err, cashout_id }, "cashout-worker: reconciliation_required state update failed — continuing"));
          return;
        }
        // Definitive Stripe error (e.g. invalid account, insufficient balance) —
        // Stripe definitely did not send funds. Safe to proceed with refund.
        logger.error(
          { stripeErr, cashout_id },
          "cashout-worker: definitive Stripe error during reconciliation — proceeding to refund"
        );
      }
    }

    // No Stripe transfer found — safe to refund the reserved balance
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(walletCashoutsTable)
        .set({
          state: "permanently_failed",
          notes: `All ${job.attemptsMade} attempts failed, no Stripe transfer found: ${err.message}`,
          updated_at: new Date(),
        })
        .where(
          sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`
        )
        .returning({ id: walletCashoutsTable.id });

      if (!updated) {
        logger.info({ cashout_id }, "cashout-worker: final failure handler — row already terminal during refund, skipping");
        return;
      }

      // Restore the reserved amount — no transfer was sent
      await tx
        .update(usersTable)
        .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${requestedAmount}` })
        .where(eq(usersTable.id, user_id));

      await tx.insert(transactionsTable).values({
        user_id,
        type: "goodwill" as const,
        amount: requestedAmount,
        description: `Cashout refunded — transfer permanently failed after ${job.attemptsMade} retries`,
      });
    });

    broadcast({ type: "wallet_cashout_reversed", payload: { user_id, cashout_id, amount: requestedAmount, reason: "all_retries_exhausted" } });

    logger.info({ cashout_id, user_id, amount: requestedAmount }, "cashout-worker: wallet refunded after final failure");
  } catch (refundErr) {
    logger.error(
      { refundErr, cashout_id, user_id, amount: requestedAmount },
      "cashout-worker: FAILED during final-failure reconciliation — MANUAL RECONCILIATION REQUIRED"
    );
  }
}

export function startCashoutWorker(): Worker<CashoutJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("cashout-worker: Redis not configured — worker will not start");
    return null;
  }

  const worker = new Worker<CashoutJobData>(QUEUE.WALLET_CASHOUTS, processCashout, {
    connection: conn,
    concurrency: 2,
    limiter: { max: 10, duration: 60_000 },
  });

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id, cashout_id: job.data.cashout_id }, "cashout-worker: job completed")
  );

  worker.on("failed", (job, err) => {
    if (job) handleCashoutFailure(job, err).catch(err2 => logger.warn({ err: err2, job_id: job?.id }, "handleCashoutFailure: non-critical side effect failed — continuing"));
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, "cashout-worker: job failed");
  });

  logger.info("cashout-worker: started (5 retries, exponential backoff)");
  return worker;
}
