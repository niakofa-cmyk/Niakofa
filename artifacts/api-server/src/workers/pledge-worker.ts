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
import { eq, and, lte, sql, isNull } from "drizzle-orm";
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

    // 4. Send push + email reminder for each overdue scheduled payment.
    //    Push reaches users who enabled notifications; email reaches everyone else.
    for (const scheduled of overdueScheduled) {
      const dateStr = scheduled.scheduled_date.toLocaleDateString("en-US", {
        month: "long", day: "numeric",
      });
      const amountStr = `${scheduled.amount.toFixed(2)}`;

      // Push notification (non-fatal if not subscribed)
      await sendPushToUser(scheduled.user_id, {
        title: "💙 Pay It Forward — Ready When You Are",
        body: `Your ${amountStr} Pay It Forward contribution was scheduled for ${dateStr}. Tap to pay when you're ready — no pressure.`,
        urgency: "normal",
        requestId: request.id ?? undefined,
        notifType: "wallet" as const,
      }).catch(err => logger.warn({ err, user_id: scheduled.user_id }, "pledge-worker: push reminder failed (non-fatal)"));

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

  // ── Step 6: Auto-default pledges > 90 days outstanding ───────────────────
  // This is the documented safety net referenced in requests.ts and the admin
  // pledge-status panel. Without this step, pledge_status='defaulted' can ONLY
  // be set manually by an admin, meaning the "90-day auto-default" described
  // in the codebase's own comments never actually triggers — defeating the pool
  // sustainability mechanism and leaving serial non-payers unblocked indefinitely.
  //
  // Clock starts at completed_at (when the request was fulfilled and the
  // Pay It Forward obligation began). Hardship exemption: accounts with a
  // pending hardship_requested_at are never auto-defaulted (admin reviews those).
  //
  // Idempotency: the WHERE clause includes pledge_status='active' so re-running
  // this step on already-defaulted rows is a no-op.
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const toDefault = await db
    .select()
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.payment_type, "pay_it_forward"),
        eq(requestsTable.status, "completed"),
        eq(requestsTable.pledge_status, "active"),
        sql`COALESCE(${requestsTable.pledge_paid}, 0) < COALESCE(${requestsTable.pledge_amount}, 0)`,
        sql`${requestsTable.completed_at} < ${ninetyDaysAgo.toISOString()}::timestamptz`,
        isNull(requestsTable.hardship_requested_at),
      )
    );

  if (toDefault.length > 0) {
    logger.info({ count: toDefault.length }, "pledge-worker: auto-defaulting pledges outstanding >90 days");

    for (const req of toDefault) {
      const [updated] = await db
        .update(requestsTable)
        .set({ pledge_status: "defaulted" })
        .where(
          and(
            eq(requestsTable.id, req.id),
            eq(requestsTable.pledge_status, "active"), // idempotency guard
          )
        )
        .returning({ id: requestsTable.id });

      if (!updated) continue; // concurrent update already handled it

      logger.warn(
        {
          request_id: req.id,
          requester_id: req.requester_id,
          outstanding: (req.pledge_amount ?? 0) - (req.pledge_paid ?? 0),
          completed_at: req.completed_at?.toISOString(),
        },
        "pledge-worker: pledge auto-defaulted after 90 days without repayment"
      );

      // Notify the requester so they know their posting ability is now blocked.
      // Look up their email synchronously within the loop so the fire-and-forget
      // mailer call has a real address (the previous placeholder was always "").
      if (req.requester_id) {
        const [requester] = await db
          .select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, req.requester_id))
          .limit(1);

        // Push notification (fire-and-forget — failure must not interrupt the loop)
        try {
          await sendPushToUser(req.requester_id, {
            title: "Pay It Forward pledge defaulted",
            body: `Your pledge for "${req.title}" has been marked as defaulted after 90 days with no repayment. Contact support to restore your posting ability.`,
            notifType: "wallet",
          });
        } catch { /* push may fail silently — continue */ }

        // Email notification — only if we resolved a real address
        if (requester?.email) {
          const recipientName = requester.name ?? "Niakofa member";
          import("../lib/mailer.js")
            .then(({ sendAlertEmail }) =>
              sendAlertEmail({
                to:      requester.email,
                subject: "Your Pay It Forward pledge has been defaulted",
                title:   "Pay It Forward pledge defaulted",
                body: [
                  `Hi ${recipientName},`,
                  "",
                  `Your Pay It Forward pledge for "${req.title}" has been marked as defaulted`,
                  "after 90 days without repayment.",
                  "",
                  "This means you cannot post new Pay It Forward requests until the pledge is resolved.",
                  "Please contact support@niakofa.app to discuss a hardship waiver or repayment plan.",
                ].join("\n"),
                ctaText: "Contact Support",
                ctaUrl:  "mailto:support@niakofa.app",
              }).catch(() => {})
            )
            .catch(() => {});
        }
      }
    }
  } else {
    logger.debug("pledge-worker: no pledges eligible for auto-default today");
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
