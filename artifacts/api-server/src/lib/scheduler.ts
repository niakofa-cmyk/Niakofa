/**
 * Scheduled Payment Reminder Worker
 *
 * Runs every 6 hours. Finds pending scheduled_payments whose scheduled_date
 * has passed and sends a push notification reminder to the requester.
 *
 * This fulfils the promise made in wallet.tsx: "we'll remind you".
 * Users still control fulfillment via the "Pay Now" button, but they get
 * a nudge when their target date arrives.
 */
import { db, scheduledPaymentsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sendPushToUser } from "../routes/push";
import { logger } from "./logger";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function processScheduledReminders(): Promise<void> {
  const now = new Date();

  let due: (typeof scheduledPaymentsTable.$inferSelect)[] = [];
  try {
    due = await db
      .select()
      .from(scheduledPaymentsTable)
      .where(
        and(
          eq(scheduledPaymentsTable.status, "pending"),
          lte(scheduledPaymentsTable.scheduled_date, now)
        )
      );
  } catch (err) {
    logger.error({ err }, "scheduler: failed to query scheduled_payments");
    return;
  }

  if (due.length === 0) return;

  logger.info({ count: due.length }, "scheduler: sending scheduled payment reminders");

  for (const payment of due) {
    const d = payment.scheduled_date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });

    await sendPushToUser(payment.user_id, {
      title: "💙 Niakofa Reminder",
      body: `Your $${payment.amount.toFixed(2)} contribution was scheduled for ${d}. Tap to pay when you're ready — no pressure.`,
      urgency: "normal",
      requestId: payment.request_id ?? undefined,
      notifType: "wallet" as const,
    }).catch(() => {});
  }
}

// ─── Pay-It-Forward Nudge Worker ─────────────────────────────────────────────
// Sends time-based repayment nudges to requesters who completed a PIF task
// but haven't made any repayment yet and set no scheduled payment.
// Windows: 2 days, 14 days, 60 days after task completion.
//
// Dedup: in-memory Set (`${requestId}:${windowDays}`). Resets on server
// restart — worst case is one extra push per window after a restart, which
// is acceptable. This mirrors the anomaly-worker dedup pattern.

const _pifNudgeSent = new Set<string>();

const PIF_NUDGE_WINDOWS = [2, 14, 60] as const;

function _pifNudgeCopy(days: number): { title: string; body: string } {
  if (days === 2) return {
    title: "💙 Whenever You're Ready — Pay It Forward",
    body: "Your neighbor helped you 2 days ago. Pay it forward whenever you're able — no deadline, no pressure.",
  };
  if (days === 14) return {
    title: "💙 Pay It Forward — 2 Weeks Later",
    body: "Your neighbor helped you 2 weeks ago. When you're back on your feet, even a small contribution keeps the chain going for the next neighbor.",
  };
  return {
    title: "💙 Pay It Forward — 2 Months",
    body: "Two months ago, your neighbor helped you out. If you're ever able, a Pay It Forward contribution keeps the chain alive. No worries either way — it's all love here. 💙",
  };
}

async function processPifNudges(): Promise<void> {
  const now = new Date();
  const { db, requestsTable } = await import("@workspace/db");
  const { eq, and, sql } = await import("drizzle-orm");

  let unpaid: { id: number; requester_id: number; completed_at: Date | null }[] = [];
  try {
    unpaid = await db
      .select({
        id: requestsTable.id,
        requester_id: requestsTable.requester_id,
        completed_at: requestsTable.completed_at,
      })
      .from(requestsTable)
      .where(
        and(
          eq(requestsTable.payment_type, "pay_it_forward"),
          eq(requestsTable.status, "completed"),
          // Nothing repaid yet
          sql`COALESCE(${requestsTable.pledge_paid}, 0) = 0`,
          // Completed but within 90 days — no point nudging ancient rows
          sql`${requestsTable.completed_at} > NOW() - INTERVAL '90 days'`,
          sql`${requestsTable.completed_at} IS NOT NULL`,
        )
      );
  } catch (err) {
    logger.error({ err }, "pif-nudge: query failed");
    return;
  }

  for (const req of unpaid) {
    if (!req.completed_at) continue;
    const daysSince = (now.getTime() - req.completed_at.getTime()) / (1000 * 60 * 60 * 24);

    for (const windowDays of PIF_NUDGE_WINDOWS) {
      // ±6 h window around the target day so we don't miss the trigger
      if (daysSince < windowDays - 0.25 || daysSince >= windowDays + 0.5) continue;

      const key = `${req.id}:${windowDays}`;
      if (_pifNudgeSent.has(key)) continue;
      _pifNudgeSent.add(key);

      const copy = _pifNudgeCopy(windowDays);
      try {
        await sendPushToUser(req.requester_id, {
          title: copy.title,
          body: copy.body,
          urgency: "normal",
          requestId: req.id,
          notifType: "wallet" as const,
        });
        logger.info({ request_id: req.id, window_days: windowDays }, "pif-nudge: reminder sent");
      } catch {
        // Never throw — keep processing other requests
      }
    }
  }
}

/** Start the Pay-It-Forward repayment nudge worker. Runs every 6 hours. */
export function startPifNudgeWorker(): () => void {
  processPifNudges().catch(() => {});
  const interval = setInterval(() => {
    processPifNudges().catch(() => {});
  }, SIX_HOURS_MS);

  logger.info({ intervalMs: SIX_HOURS_MS, windows: PIF_NUDGE_WINDOWS }, "scheduler: PIF nudge worker started");

  return () => {
    clearInterval(interval);
    logger.info("scheduler: PIF nudge worker stopped");
  };
}

/** Start the scheduled payment reminder worker. Returns a cleanup function. */
export function startScheduledPaymentReminder(): () => void {
  // Run once immediately on server start, then every 6 hours
  processScheduledReminders().catch(() => {});
  const interval = setInterval(() => {
    processScheduledReminders().catch(() => {});
  }, SIX_HOURS_MS);

  logger.info({ intervalMs: SIX_HOURS_MS }, "scheduler: scheduled payment reminder worker started");

  return () => {
    clearInterval(interval);
    logger.info("scheduler: scheduled payment reminder worker stopped");
  };
}
