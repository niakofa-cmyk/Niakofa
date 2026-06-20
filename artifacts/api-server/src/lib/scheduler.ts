/**
 * Scheduled Workers
 *
 * 1. Scheduled Payment Reminder — runs every 6 hours. Finds pending
 *    scheduled_payments whose scheduled_date has passed and sends a push
 *    notification reminder to the requester.
 *
 * 2. Recurring Request Worker — runs every hour. Fires recurring help
 *    requests whose next_fire_at is in the past, posts them to the open pool,
 *    and notifies nearby helpers.
 */
import { db, scheduledPaymentsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sendPushToUser } from "../routes/push";
import { processRecurringRequests } from "../routes/recurring";
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
    }).catch(() => {});
  }
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

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Start the recurring request worker. Fires every hour. Returns a cleanup function. */
export function startRecurringRequestWorker(): () => void {
  // Run once immediately on server start, then every hour
  processRecurringRequests().catch(() => {});
  const interval = setInterval(() => {
    processRecurringRequests().catch(() => {});
  }, ONE_HOUR_MS);

  logger.info({ intervalMs: ONE_HOUR_MS }, "recurring-worker: started");

  return () => {
    clearInterval(interval);
    logger.info("recurring-worker: stopped");
  };
}
