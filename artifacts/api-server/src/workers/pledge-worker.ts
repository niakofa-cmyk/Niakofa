/**
 * Pay It Forward Pledge Reconciliation + Repayment Reminder Worker
 *
 * Runs daily via BullMQ repeatable job.
 * Scans all completed Pay It Forward requests where pledge_paid < pledge_amount
 * and pledge_status = 'active' (skips forgiven/written_off — those are closed
 * and should not generate reminders or affect the runway metric) and either:
 *   a) Sends a push + email reminder if a scheduled_payment date has passed
 *   b) Marks the payment_transaction as "partially_repaid" if some was paid back
 *   c) Marks as "pending_contribution" if nothing paid yet (awaiting Pay It Forward)
 *
 * Pay It Forward payment state transitions:
 *   PLEDGED (pending_contribution) → PARTIAL (partially_repaid) → CLOSED (completed)
 *   Or: PLEDGED → SPONSORED (community pool covers it)
 *   Or: PLEDGED → FORGIVEN/WRITTEN_OFF (pledge_status set by admin — no further reminders)
 */
import { Worker, type Job } from "bullmq";
import { db, requestsTable, scheduledPaymentsTable, paymentTransactionsTable, usersTable } from "@workspace/db";
import { eq, and, lte, isNull, sql } from "drizzle-orm";
import { getRedisConnection, QUEUE } from "../lib/queue";
import { sendPushToUser } from "../routes/push";
import { logger } from "../lib/logger";

const PLEDGE_JOB_NAME = "daily-pledge-reconciliation";
// Repeat every 24 hours
const PLEDGE_REPEAT_OPTS = { pattern: "0 9 * * *" }; // 9 AM daily

async function reconcilePledges(_job: Job): Promise<void> {
  const now = new Date();
  logger.info({ at: now.toISOString() }, "pledge-worker: starting reconciliation");

  // 1. Find all active Pay It Forward requests that are completed but not fully paid back.
  //    Exclude forgiven / written_off pledges — those are closed by admin decision and
  //    must never generate reminders or pollute the outstanding-balance metric.
  const unpaidPledges = await db
    .select()
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.payment_type, "pay_it_forward"),
        eq(requestsTable.status, "completed"),
        eq(requestsTable.pledge_status, "active"),
        // pledge_paid < pledge_amount (still outstanding)
        sql`COALESCE(${requestsTable.pledge_paid}, 0) < COALESCE(${requestsTable.pledge_amount}, 0)`,
        // ── Hardship exclusion ────────────────────────────────────────────
        // A user who has filed a hardship request is in financial distress.
        // Sending them a "pay now" push + email that same morning is actively
        // harmful and undermines the platform's mutual-aid ethic.
        //
        // Reminders resume automatically the NEXT daily run after the hardship
        // is dismissed by an admin (hardship_requested_at is cleared to NULL).
        // Forgiven/written_off pledges are already excluded by pledge_status
        // above, so this only guards the "still active, hardship pending" case.
        isNull(requestsTable.hardship_requested_at)
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

    // 3. Check for overdue scheduled payments for this request.
    //    Dedup: only send if last_reminder_sent_at IS NULL OR > 24h ago.
    //    This mirrors scheduler.ts::processScheduledReminders() dedup gate so
    //    users can't receive multiple reminder paths firing on the same day.
    const overdueScheduled = await db
      .select()
      .from(scheduledPaymentsTable)
      .where(
        and(
          eq(scheduledPaymentsTable.request_id, request.id),
          eq(scheduledPaymentsTable.status, "pending"),
          lte(scheduledPaymentsTable.scheduled_date, now),
          sql`(${scheduledPaymentsTable.last_reminder_sent_at} IS NULL
            OR ${scheduledPaymentsTable.last_reminder_sent_at} < NOW() - INTERVAL '24 hours')`
        )
      );

    // 4. Send push + email reminder for each overdue scheduled payment.
    //    Push reaches users who enabled notifications; email reaches everyone else.
    for (const scheduled of overdueScheduled) {
      const dateStr = scheduled.scheduled_date.toLocaleDateString("en-US", {
        month: "long", day: "numeric",
      });
      const amountStr = `${scheduled.amount.toFixed(2)}`;

      // Push notification (non-fatal if not subscribed)
      const sent = await sendPushToUser(scheduled.user_id, {
        title: "💙 Pay It Forward — Ready When You Are",
        body: `Your ${amountStr} Pay It Forward contribution was scheduled for ${dateStr}. Tap to pay when you're ready — no pressure.`,
        urgency: "normal",
        requestId: request.id ?? undefined,
        notifType: "wallet" as const,
      }).then(() => true).catch(err => {
        logger.warn({ err, user_id: scheduled.user_id }, "pledge-worker: push reminder failed (non-fatal)");
        return false;
      });

      // Email reminder — look up the requester's email so we can send a warm reminder.
      // Uses lazy import to avoid circular dependency with the workers bootstrap file.
      try {
        const [requester] = await db
          .select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, scheduled.user_id))
          .limit(1);

        if (requester?.email) {
          const { sendAlertEmail } = await import("../lib/mailer.js");
          await sendAlertEmail({
            to: requester.email,
            subject: "💙 Your Pay It Forward reminder — ready when you are",
            title: "Pay It Forward",
            body: `Hi ${requester.name ?? "neighbor"},<br><br>
Your ${amountStr} Pay It Forward contribution for <strong>${request.title ?? "a recent request"}</strong> was scheduled for ${dateStr}.<br><br>
When you're ready, you can pay through the Niakofa app — every contribution keeps the cycle of care going in Fort Worth.<br><br>
<em>No pressure, no deadline. Pay it forward when it's right for you. 💙</em>`,
          });
          logger.info(
            { user_id: scheduled.user_id, request_id: request.id, amount: scheduled.amount },
            "pledge-worker: email + push reminder sent"
          );
        }
      } catch (err) {
        logger.warn({ err, user_id: scheduled.user_id }, "pledge-worker: email reminder failed (non-fatal)");
      }

      // Stamp send time so neither this worker NOR the scheduler's 6-hour cron
      // will re-send the same payment reminder within 24 hours.
      if (sent) {
        await db
          .update(scheduledPaymentsTable)
          .set({ last_reminder_sent_at: new Date() })
          .where(eq(scheduledPaymentsTable.id, scheduled.id))
          .catch(() => {});
      }
    }

    // 5. Log long-outstanding pledges (> 30 days) for admin visibility
    const completedAt = request.completed_at;
    if (completedAt) {
      const daysSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCompletion > 30 && outstanding > 0) {
        logger.warn(
          { request_id: request.id, outstanding, days: Math.round(daysSinceCompletion) },
          "pledge-worker: long-outstanding Pay It Forward pledge (>30 days) — consider marking forgiven/written_off in admin panel"
        );
      }
    }
  }

  // ── Step 6 removed ────────────────────────────────────────────────────────
  // Auto-default logic (pledges > 90 days outstanding) is now the sole
  // responsibility of scheduler.ts::startPledgeDefaultWorker, which runs as
  // a setInterval every 12 hours and works with or without Redis.
  //
  // Having Step 6 here AND in scheduler.ts was redundant: both read the same
  // rows and the atomic WHERE pledge_status='active' guard prevented double-
  // processing, but it wasted a DB scan and created two surfaces that had to
  // be kept in sync. With Step 6 removed, the single source of truth is
  // scheduler.ts — edit that file for any changes to default eligibility,
  // penalty amounts, or notification copy.

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
