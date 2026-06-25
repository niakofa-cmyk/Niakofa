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
import { db, scheduledPaymentsTable, usersTable, ratingsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
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
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * BUG-018: Trust Score Recency Decay — Weekly Batch Recomputation
 *
 * The recency-weighted trust score is only recomputed when a NEW rating is
 * submitted. Old ratings decay in mathematical weight over time (90-day half-life),
 * but without this job, a helper who stops using the app retains whatever score
 * they had at their last rating — even if all their ratings are now stale.
 *
 * This job recomputes trust_score for every user who has at least one rating,
 * applying the same recency-weighted formula used in the rating endpoint:
 *   score = round(weighted_avg_stars * 20)  (1★ = 20, 5★ = 100)
 *
 * Skips banned users (trust_score = -1) to preserve moderation actions.
 */
async function processWeeklyTrustDecay(): Promise<void> {
  logger.info("trust-decay: starting weekly trust score recomputation");

  // Get all users who have ever been rated
  let ratees: { id: number; trust_score: number | null; identity_verified: boolean }[] = [];
  try {
    ratees = await db
      .selectDistinct({ id: usersTable.id, trust_score: usersTable.trust_score, identity_verified: usersTable.identity_verified })
      .from(usersTable)
      .where(sql`${usersTable.id} IN (SELECT DISTINCT ratee_id FROM ratings)`);
  } catch (err) {
    logger.error({ err }, "trust-decay: failed to query ratees");
    return;
  }

  const RECENCY_HALF_LIFE_DAYS = 90;
  const now = Date.now();
  let updated = 0;
  let skipped = 0;

  for (const user of ratees) {
    if (user.trust_score === -1) { skipped++; continue; } // banned — never touch

    try {
      const ratings = await db
        .select({ stars: ratingsTable.stars, created_at: ratingsTable.created_at })
        .from(ratingsTable)
        .where(eq(ratingsTable.ratee_id, user.id));

      if (ratings.length === 0) continue;

      let weightedSum = 0;
      let totalWeight = 0;
      for (const r of ratings) {
        const daysAgo = (now - r.created_at.getTime()) / (1000 * 60 * 60 * 24);
        const weight = Math.pow(0.5, daysAgo / RECENCY_HALF_LIFE_DAYS);
        weightedSum += r.stars * weight;
        totalWeight += weight;
      }
      const avgStars = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const rawScore = Math.round(avgStars * 20);
      // BUG-24: Identity-verified users have a trust floor of 40 (2★) so the
      // decay job cannot drop them below baseline verification level.
      const VERIFIED_FLOOR = 40;
      const newScore = user.identity_verified ? Math.max(rawScore, VERIFIED_FLOOR) : rawScore;

      if (newScore !== user.trust_score) {
        await db.update(usersTable)
          .set({ trust_score: newScore })
          .where(eq(usersTable.id, user.id));
        updated++;
      }
    } catch (err) {
      logger.error({ err, user_id: user.id }, "trust-decay: failed to recompute user trust_score");
    }
  }

  logger.info({ total: ratees.length, updated, skipped }, "trust-decay: weekly recomputation complete");
}

/** Start the weekly trust-score recency decay worker. Returns a cleanup function. */
export function startTrustScoreDecayWorker(): () => void {
  // Run once immediately on server start, then every week
  processWeeklyTrustDecay().catch(() => {});
  const interval = setInterval(() => {
    processWeeklyTrustDecay().catch(() => {});
  }, ONE_WEEK_MS);

  logger.info({ intervalMs: ONE_WEEK_MS }, "trust-decay: weekly recomputation worker started");

  return () => {
    clearInterval(interval);
    logger.info("trust-decay: worker stopped");
  };
}
