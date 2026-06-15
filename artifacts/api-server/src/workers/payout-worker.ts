/**
 * Payout Worker — Retries failed Stripe Connect transfers with exponential backoff.
 *
 * Triggered when: a Stripe transfer fails during request completion.
 * Retry schedule: 5 min → 10 min → 20 min → 40 min → 80 min (5 attempts max).
 *
 * On success: records a paymentTransactions row and broadcasts payout_sent.
 * On final failure: marks the paymentTransactions row as "failed" and alerts admin.
 */
import { Worker, type Job } from "bullmq";
import Stripe from "stripe";
import { db, paymentTransactionsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getRedisConnection, QUEUE, type PayoutJobData } from "../lib/queue";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";

async function processPayout(job: Job<PayoutJobData>): Promise<void> {
  const {
    request_id, helper_id, requester_id,
    amount_cents, platform_fee_cents, stripe_account_id,
    request_title,
  } = job.data;

  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const stripe = new Stripe(stripeKey);
  const payoutCents = amount_cents - platform_fee_cents;

  logger.info(
    { request_id, helper_id, payoutCents, attempt: job.attemptsMade + 1 },
    "payout-worker: processing"
  );

  const transfer = await stripe.transfers.create({
    amount: payoutCents,
    currency: "usd",
    destination: stripe_account_id,
    description: `Niakofa — Pay It Forward: ${request_title}`,
    metadata: {
      request_id:          String(request_id),
      helper_id:           String(helper_id),
      platform_fee_cents:  String(platform_fee_cents),
      retried:             "true",
      attempt:             String(job.attemptsMade + 1),
    },
  });

  // Record in payment ledger
  await db.insert(paymentTransactionsTable).values({
    request_id,
    helper_id,
    requester_id,
    amount: payoutCents / 100,
    state: "completed",
    payment_type: "immediate",
    stripe_transfer_id: transfer.id,
    notes: `Retry payout (attempt ${job.attemptsMade + 1}). Platform fee: $${(platform_fee_cents / 100).toFixed(2)}`,
  });

  // Record in helper's earnings history
  await db.insert(transactionsTable).values({
    user_id: helper_id,
    request_id,
    type: "payout_sent",
    amount: payoutCents / 100,
    description: `[Retry] ${request_title}`,
  });

  broadcast({
    type: "payout_sent",
    payload: {
      request_id,
      helper_id,
      amount: payoutCents / 100,
      transfer_id: transfer.id,
      retried: true,
    },
  });

  logger.info({ request_id, transfer_id: transfer.id }, "payout-worker: succeeded");
}

async function handlePayoutFailure(job: Job<PayoutJobData>, err: Error): Promise<void> {
  // Only log on final failure (not intermediate retries)
  if (job.attemptsMade >= (job.opts.attempts ?? 5) - 1) {
    logger.error(
      { request_id: job.data.request_id, helper_id: job.data.helper_id, err },
      "payout-worker: all retries exhausted — manual intervention required"
    );

    // Mark a failed paymentTransactions row so the admin dashboard can surface it
    await db.insert(paymentTransactionsTable).values({
      request_id:   job.data.request_id,
      helper_id:    job.data.helper_id,
      requester_id: job.data.requester_id,
      amount:       job.data.amount_cents / 100,
      state:        "failed",
      payment_type: "immediate",
      notes:        `Payout failed after ${job.attemptsMade + 1} attempts: ${err.message}`,
    }).onConflictDoNothing();
  }
}

export function startPayoutWorker(): Worker<PayoutJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("payout-worker: Redis not configured — worker will not start");
    return null;
  }

  const worker = new Worker<PayoutJobData>(QUEUE.PAYOUTS, processPayout, {
    connection: conn,
    concurrency: 2,
    limiter: { max: 10, duration: 60_000 }, // max 10 payouts/min (Stripe rate limits)
  });

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id, request_id: job.data.request_id }, "payout-worker: job completed")
  );

  worker.on("failed", (job, err) => {
    if (job) handlePayoutFailure(job, err).catch(() => {});
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, "payout-worker: job failed");
  });

  logger.info("payout-worker: started (5 retries, exponential backoff)");
  return worker;
}
