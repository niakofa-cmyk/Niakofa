/**
 * Pay It Forward Pledge Reconciliation Worker
 *
 * Runs daily via BullMQ repeatable job.
 * Scans all completed Pay It Forward requests where pledge_paid < pledge_amount
 * and either:
 *   a) Sends a push reminder if a scheduled_payment date has passed
 *   b) Marks the payment_transaction as "partially_repaid" if some was paid back
 *   c) Marks as "pending_contribution" if nothing paid yet (awaiting Pay It Forward)
 *
 * Pay It Forward payment state transitions:
 *   PLEDGED (pending_contribution) → PARTIAL (partially_repaid) → CLOSED (completed)
 *   Or: PLEDGED → SPONSORED (community pool covers it)
 */
import { Worker, type Job } from "bullmq";
import { db, requestsTable, scheduledPaymentsTable, paymentTransactionsTable } from "@workspace/db";
import { eq, and, lt, lte, sql } from "drizzle-orm";
import { getRedisConnection, QUEUE } from "../lib/queue";
import { sendPushToUser } from "../routes/push";
import { logger } from "../lib/logger";

const PLEDGE_JOB_NAME = "daily-pledge-reconciliation";
// Repeat every 24 hours
const PLEDGE_REPEAT_OPTS = { pattern: "0 9 * * *" }; // 9 AM daily

async function reconcilePledges(_job: Job): Promise<void> {
  const now = new Date();
  logger.info({ at: now.toISOString() }, "pledge-worker: starting reconciliation");

  // 1. Find all Pay It Forward requests that are completed but not fully paid back
  const unpaidPledges = await db
    .select()
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.payment_type, "pay_it_forward"),
        eq(requestsTable.status, "completed"),
        // pledge_paid < pledge_amount (still outstanding)
        sql`COALESCE(${requestsTable.pledge_paid}, 0) < COALESCE(${requestsTable.pledge_amount}, 0)`
      )
    );

  logger.info({ count: unpaidPledges.length }, "pledge-worker: outstanding Pay It Forward pledges");

  for (const request of unpaidPledges) {
    const pledgeAmount = request.pledge_amount ?? 0;
    const pledgePaid   = request.pledge_paid   ?? 0;
    const outstanding  = pledgeAmount - pledgePaid;

    // 2. Update payment_transactions state
    const newState = pledgePaid > 0 ? "partially_repaid" : "pending_contribution";
    await db
      .update(paymentTransactionsTable)
      .set({ state: newState, updated_at: now })
      .where(
        and(
          eq(paymentTransactionsTable.request_id, request.id),
          eq(paymentTransactionsTable.payment_type, "pay_it_forward")
        )
      );

    // 3. Check for overdue scheduled payments for this request
    const overdueScheduled = await db
      .select()
      .from(scheduledPaymentsTable)
      .where(
        and(
          eq(scheduledPaymentsTable.request_id, request.id),
          eq(scheduledPaymentsTable.status, "pending"),
          lte(scheduledPaymentsTable.scheduled_date, now)
        )
      );

    // 4. Send push reminder for each overdue scheduled payment
    for (const scheduled of overdueScheduled) {
      const dateStr = scheduled.scheduled_date.toLocaleDateString("en-US", {
        month: "long", day: "numeric",
      });

      await sendPushToUser(scheduled.user_id, {
        title: "💙 Pay It Forward — Ready When You Are",
        body: `Your $${scheduled.amount.toFixed(2)} Pay It Forward contribution was scheduled for ${dateStr}. Tap to pay when you're ready — no pressure.`,
        urgency: "normal",
        requestId: request.id ?? undefined,
        notifType: "wallet" as const,
      }).catch(() => {});

      logger.info(
        { user_id: scheduled.user_id, request_id: request.id, amount: scheduled.amount },
        "pledge-worker: reminder sent"
      );
    }

    // 5. Log long-outstanding pledges (> 30 days) for admin visibility
    const completedAt = request.completed_at;
    if (completedAt) {
      const daysSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCompletion > 30 && outstanding > 0) {
        logger.warn(
          { request_id: request.id, outstanding, days: Math.round(daysSinceCompletion) },
          "pledge-worker: long-outstanding Pay It Forward pledge (>30 days)"
        );
      }
    }
  }

  logger.info("pledge-worker: reconciliation complete");
}

export async function startPledgeWorker(): Promise<Worker | null> {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("pledge-worker: Redis not configured — worker will not start");
    return null;
  }

  // Schedule the daily job (idempotent — BullMQ deduplicates repeatable jobs by name)
  const { pledgeQueue } = await import("../lib/queue");
  if (pledgeQueue) {
    await pledgeQueue.add(PLEDGE_JOB_NAME, {}, {
      repeat: PLEDGE_REPEAT_OPTS,
      jobId: PLEDGE_JOB_NAME,   // stable ID prevents duplicate scheduling on restart
    });
    logger.info("pledge-worker: daily reconciliation scheduled (9 AM)");
  }

  const worker = new Worker(QUEUE.PLEDGE_RECONCILIATION, reconcilePledges, {
    connection: conn,
    concurrency: 1,  // single-threaded — DB writes must serialize
  });

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "pledge-worker: reconciliation complete")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "pledge-worker: reconciliation failed")
  );

  logger.info("pledge-worker: started");
  return worker;
}
