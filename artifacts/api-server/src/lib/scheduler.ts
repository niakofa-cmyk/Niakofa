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
import { db, scheduledPaymentsTable, walletCashoutsTable, usersTable, transactionsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import Stripe from "stripe";
import { sendPushToUser } from "../routes/push";
import { logger } from "./logger";
import { isAmbiguousStripeError } from "./stripe-errors";
import { buildCashoutTransferParams, cashoutIdempotencyKey } from "./stripe-cashout";

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
          lte(scheduledPaymentsTable.scheduled_date, now),
          // Dedup: only send if never reminded OR last reminder was > 24 hours ago.
          // Without this, a user who intends to pay later receives a new push every
          // 6 hours indefinitely for the same payment — feels spammy and erodes trust.
          // The column is added by migration 0042; IS NULL covers rows from before the migration.
          sql`(${scheduledPaymentsTable.last_reminder_sent_at} IS NULL
            OR ${scheduledPaymentsTable.last_reminder_sent_at} < NOW() - INTERVAL '24 hours')`
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

    const sent = await sendPushToUser(payment.user_id, {
      title: "💙 Niakofa Reminder",
      body: `Your $${payment.amount.toFixed(2)} contribution was scheduled for ${d}. Tap to pay when you're ready — no pressure.`,
      urgency: "normal",
      requestId: payment.request_id ?? undefined,
      notifType: "wallet" as const,
    }).then(() => true).catch(() => false);

    // Record the send time so this payment isn't reminded again within 24 hours.
    // Failure here is non-critical — worst case is one extra nudge on the next run.
    if (sent) {
      await db
        .update(scheduledPaymentsTable)
        .set({ last_reminder_sent_at: new Date() })
        .where(eq(scheduledPaymentsTable.id, payment.id))
        .catch(() => {});
    }
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

// ─── Pledge Default Worker ────────────────────────────────────────────────────
// After 90 days with no repayment, a PIF pledge is considered defaulted.
// This worker:
//   1. Finds completed PIF requests with pledge_paid=0 after the 90-day window
//   2. Sets pledge_status='defaulted'
//   3. Applies a trust-score penalty (-10 points, floored at 0)
//   4. Logs the action for the admin audit trail
//
// "Defaulted" is softer than "written_off": the requester can still repay at
// any time and the admin can restore the pledge_status manually. The trust hit
// is what makes future PIF requests impossible until they pay something back.

const PLEDGE_DEFAULT_DAYS = 90;

export async function processPledgeDefaults(): Promise<void> {
  const { db, requestsTable, usersTable } = await import("@workspace/db");
  const { eq, and, sql, lt } = await import("drizzle-orm");

  let overdue: { id: number; requester_id: number; completed_at: Date | null }[] = [];
  try {
    overdue = await db
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
          eq(requestsTable.pledge_status, "active"), // only active pledges; forgiven/written_off already resolved
          // Any unpaid balance (partial or zero) — mirrors pledge-worker.ts eligibility
          sql`COALESCE(${requestsTable.pledge_paid}, 0) < COALESCE(${requestsTable.pledge_amount}, 0)`,
          // Hardship exemption — admin reviews these separately, never auto-default them
          sql`${requestsTable.hardship_requested_at} IS NULL`,
          // More than 90 days since completion — past the grace window
          sql`${requestsTable.completed_at} < NOW() - INTERVAL '${sql.raw(String(PLEDGE_DEFAULT_DAYS))} days'`,
          sql`${requestsTable.completed_at} IS NOT NULL`,
        )
      );
  } catch (err) {
    logger.error({ err }, "pledge-default: query failed");
    return;
  }

  if (overdue.length === 0) return;

  logger.info({ count: overdue.length }, "pledge-default: processing overdue pledges");

  for (const req of overdue) {
    try {
      // Atomic conditional update — WHERE pledge_status='active' prevents double-processing
      // in multi-instance deployments where two workers might race on the same row.
      const { and: drAnd, eq: drEq } = await import("drizzle-orm");
      const updated = await db
        .update(requestsTable)
        .set({ pledge_status: "defaulted" })
        .where(drAnd(
          drEq(requestsTable.id, req.id),
          drEq(requestsTable.pledge_status, "active"), // Guard: only process active pledges
        ))
        .returning({ id: requestsTable.id });

      // If zero rows were updated, another instance already processed this row — skip penalty
      if (updated.length === 0) {
        logger.debug({ request_id: req.id }, "pledge-default: row already processed by another worker — skipping");
        continue;
      }

      // Apply trust-score penalty only after winning the race
      await db
        .update(usersTable)
        .set({
          trust_score: sql`GREATEST(0, COALESCE(trust_score, 5.0) - 10)`,
          goodwill_score: sql`GREATEST(0, COALESCE(goodwill_score, 0) - 5)`,
        })
        .where(eq(usersTable.id, req.requester_id));

      // Fire push + email — mirrors pledge-worker.ts Step 6 so outcome is
      // identical regardless of which cron wins the 90-day race.
      // The atomic WHERE pledge_status='active' above ensures only one worker
      // ever reaches this block for any given row.
      sendPushToUser(req.requester_id, {
        title: "Pay It Forward pledge defaulted",
        body: `Your pledge has been marked as defaulted after ${PLEDGE_DEFAULT_DAYS} days. Make any repayment in your wallet to restore your posting ability.`,
        urgency: "normal",
        notifType: "wallet" as const,
      }).catch(() => {});

      // Look up requester email for mailer — fire-and-forget, never throws
      db.select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, req.requester_id))
        .limit(1)
        .then(([requester]) => {
          if (!requester?.email) return;
          import("./mailer.js")
            .then(({ sendAlertEmail }) =>
              sendAlertEmail({
                to: requester.email,
                subject: "Your Pay It Forward pledge has been defaulted",
                title: "Pay It Forward pledge defaulted",
                body: [
                  `Hi ${requester.name ?? "neighbor"},`,
                  "",
                  `Your Pay It Forward pledge has been marked as defaulted after ${PLEDGE_DEFAULT_DAYS} days without repayment.`,
                  "This means you cannot post new Pay It Forward requests until the pledge is resolved.",
                  "",
                  "Make any payment — even a small one — in your Niakofa wallet to restore your posting ability immediately.",
                  "Or submit a hardship request if you're going through a difficult time and need a waiver.",
                ].join("\n"),
                ctaText: "Open My Wallet",
                ctaUrl: `${process.env["APP_URL"] ?? "https://niakofa.com"}/wallet`,
              }).catch(() => {})
            )
            .catch(() => {});
        })
        .catch(() => {});

      logger.info(
        { request_id: req.id, requester_id: req.requester_id, days: PLEDGE_DEFAULT_DAYS },
        "pledge-default: pledge defaulted, trust score penalized, notification dispatched"
      );
    } catch (err) {
      logger.error({ err, request_id: req.id }, "pledge-default: failed to process row");
    }
  }
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/** Start the pledge default worker. Runs every 12 hours. */
export function startPledgeDefaultWorker(): () => void {
  processPledgeDefaults().catch(() => {});
  const interval = setInterval(() => {
    processPledgeDefaults().catch(() => {});
  }, TWELVE_HOURS_MS);

  logger.info({ intervalMs: TWELVE_HOURS_MS, grace_days: PLEDGE_DEFAULT_DAYS }, "scheduler: pledge default worker started");

  return () => {
    clearInterval(interval);
    logger.info("scheduler: pledge default worker stopped");
  };
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

// ── Cashout Reconciliation Cron ───────────────────────────────────────────────
// Runs every 10 minutes. Scans wallet_cashouts for stuck rows.
//
// CRITICAL INVARIANT: we NEVER auto-refund based solely on stripe_transfer_id
// IS NULL. A NULL means "we didn't record the transfer ID", not "Stripe didn't
// send the money". The server could crash between the Stripe API call succeeding
// and the DB write recording the transfer ID.
//
// Instead, for every stale row we perform an authoritative Stripe probe:
//   1. Attempt stripe.transfers.create with the SAME idempotency key (`cashout-${id}`).
//      Stripe deduplicates by key and returns the original response:
//        • Returns transfer object → Stripe DID process it → record + mark 'completed'.
//        • Returns definitive error → Stripe definitively rejected → safe to refund.
//        • Returns ambiguous error (timeout/connection) → mark 'reconciliation_required'.
//   2. If stripe_account_id is missing (schema gap) → can't probe → mark 'reconciliation_required'.
//
// 'reconciliation_required' rows are never auto-refunded — they require operator review.

const TEN_MINUTES_MS = 10 * 60 * 1000;
const STALE_FAILED_HOURS = 24;   // 'failed' rows older than this get probed
const STALE_PENDING_HOURS = 2;   // 'pending' rows older than this get probed

async function reconcileOneCashoutRow(
  row: typeof walletCashoutsTable.$inferSelect,
  stripe: Stripe
): Promise<void> {
  const { id: cashout_id, user_id, amount, stripe_account_id, state } = row;
  const amountCents = Math.round(amount * 100);

  // Cannot probe without a destination — escalate for operator review
  if (!stripe_account_id) {
    logger.error(
      { cashout_id, state },
      "cashout-reconciliation: missing stripe_account_id — marking reconciliation_required"
    );
    await db
      .update(walletCashoutsTable)
      .set({ state: "reconciliation_required", notes: "Missing stripe_account_id — manual review required", updated_at: new Date() })
      .where(sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`);
    return;
  }

  let transfer: Stripe.Transfer;
  try {
    // Re-issue with same idempotency key — Stripe returns the original transfer
    // if one was created, or creates a new one if it never ran. Either way, if
    // this call succeeds, money IS going to the helper.
    transfer = await stripe.transfers.create(
      buildCashoutTransferParams({
        cashout_id,
        user_id,
        stripe_account_id,
        amount_cents: amountCents,
      }),
      { idempotencyKey: cashoutIdempotencyKey(cashout_id) }
    );
  } catch (stripeErr: unknown) {
    if (isAmbiguousStripeError(stripeErr)) {
      // Network/timeout — cannot determine outcome. Do NOT refund.
      logger.warn(
        { cashout_id, stripeErr },
        "cashout-reconciliation: ambiguous Stripe error during probe — marking reconciliation_required, NO auto-refund"
      );
      await db
        .update(walletCashoutsTable)
        .set({
          state: "reconciliation_required",
          notes: `Ambiguous Stripe probe: ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`,
          updated_at: new Date(),
        })
        .where(sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`);
      return;
    }

    // Definitive Stripe rejection (bad destination, invalid account, etc.) — safe to refund.
    logger.warn(
      { cashout_id, stripeErr },
      "cashout-reconciliation: Stripe definitively rejected — refunding wallet"
    );
    try {
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(walletCashoutsTable)
          .set({
            state: "permanently_failed",
            notes: `Cron: Stripe definitively rejected — ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`,
            updated_at: new Date(),
          })
          .where(
            // State guard: only act on rows we expect; concurrent updates will
            // produce 0 rows and skip the balance change.
            sql`${walletCashoutsTable.id} = ${cashout_id}
              AND ${walletCashoutsTable.state} IN ('pending', 'failed')
              AND ${walletCashoutsTable.stripe_transfer_id} IS NULL`
          )
          .returning({ id: walletCashoutsTable.id });
        if (!updated) return; // Another path already resolved this row

        await tx
          .update(usersTable)
          .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amount}` })
          .where(eq(usersTable.id, user_id));

        await tx.insert(transactionsTable).values({
          user_id,
          type: "goodwill" as const,
          amount,
          description: `Cashout refunded by reconciliation cron (Stripe definitively rejected)`,
        });
      });
    } catch (refundErr) {
      logger.error({ refundErr, cashout_id }, "cashout-reconciliation: refund DB write failed — MANUAL RECONCILIATION REQUIRED");
    }
    return;
  }

  // ── Stripe returned a transfer → money is in flight or already sent ─────────
  // Record the transfer ID and mark completed. No balance change (wallet was
  // already decremented in Phase 1).
  logger.info(
    { cashout_id, transfer_id: transfer.id },
    "cashout-reconciliation: Stripe probe confirmed transfer — marking completed"
  );
  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(walletCashoutsTable)
        .set({
          state: "completed",
          stripe_transfer_id: transfer.id,
          notes: "Reconciled by cron — transfer confirmed via idempotency-key probe",
          updated_at: new Date(),
        })
        .where(sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`)
        .returning({ id: walletCashoutsTable.id });
      if (!updated) return;

      // Write ledger entry for audit trail (balance was already decremented)
      await tx.insert(transactionsTable).values({
        user_id,
        type: "payout_sent" as const,
        amount: -amount,
        description: `[Cron-reconciled] Goodwill Fund cashout via Stripe (${transfer.id})`,
      });
    });
  } catch (dbErr) {
    logger.error(
      { dbErr, cashout_id, transfer_id: transfer.id },
      "cashout-reconciliation: DB update failed after confirmed transfer — transfer DID go through; manual row fix needed"
    );
  }
}

async function processCashoutReconciliation(): Promise<void> {
  const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
  if (!STRIPE_SECRET_KEY) {
    logger.debug("cashout-reconciliation: STRIPE_SECRET_KEY not configured — skipping run");
    return;
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });

  const now = new Date();

  // ── 1. Stale 'failed' rows ──────────────────────────────────────────────────
  const staleFailedCutoff = new Date(now.getTime() - STALE_FAILED_HOURS * 60 * 60 * 1000);
  let staleFailed: (typeof walletCashoutsTable.$inferSelect)[] = [];
  try {
    staleFailed = await db
      .select()
      .from(walletCashoutsTable)
      .where(
        sql`${walletCashoutsTable.state} = 'failed'
          AND ${walletCashoutsTable.created_at} < ${staleFailedCutoff}
          AND ${walletCashoutsTable.stripe_transfer_id} IS NULL`
      )
      .limit(20);
  } catch (err) {
    logger.error({ err }, "cashout-reconciliation: query failed — skipping");
    return;
  }

  for (const row of staleFailed) {
    logger.warn(
      { cashout_id: row.id, user_id: row.user_id, age_hours: STALE_FAILED_HOURS },
      "cashout-reconciliation: stale failed row — probing Stripe"
    );
    await reconcileOneCashoutRow(row, stripe).catch((err: unknown) =>
      logger.error({ err, cashout_id: row.id }, "cashout-reconciliation: reconcileOneCashoutRow threw unexpectedly")
    );
  }

  // ── 2. Stale 'pending' rows ─────────────────────────────────────────────────
  const stalePendingCutoff = new Date(now.getTime() - STALE_PENDING_HOURS * 60 * 60 * 1000);
  let stalePending: (typeof walletCashoutsTable.$inferSelect)[] = [];
  try {
    stalePending = await db
      .select()
      .from(walletCashoutsTable)
      .where(
        sql`${walletCashoutsTable.state} = 'pending'
          AND ${walletCashoutsTable.created_at} < ${stalePendingCutoff}
          AND ${walletCashoutsTable.stripe_transfer_id} IS NULL`
      )
      .limit(20);
  } catch (err) {
    logger.error({ err }, "cashout-reconciliation: pending query failed — skipping");
    return;
  }

  for (const row of stalePending) {
    logger.warn(
      { cashout_id: row.id, user_id: row.user_id, age_hours: STALE_PENDING_HOURS },
      "cashout-reconciliation: stale pending row — probing Stripe"
    );
    await reconcileOneCashoutRow(row, stripe).catch((err: unknown) =>
      logger.error({ err, cashout_id: row.id }, "cashout-reconciliation: reconcileOneCashoutRow threw unexpectedly")
    );
  }

  // ── 3. Alert on 'reconciliation_required' rows ──────────────────────────────
  // These are never auto-resolved. Log every run so operators can see them.
  let reconRequired: (typeof walletCashoutsTable.$inferSelect)[] = [];
  try {
    reconRequired = await db
      .select()
      .from(walletCashoutsTable)
      .where(sql`${walletCashoutsTable.state} = 'reconciliation_required'`)
      .limit(50);
  } catch { /* non-fatal */ }

  if (reconRequired.length > 0) {
    logger.warn(
      { count: reconRequired.length, ids: reconRequired.map(r => r.id) },
      "cashout-reconciliation: OPERATOR ACTION REQUIRED — rows in reconciliation_required state (ambiguous Stripe outcome — verify via Stripe dashboard before refunding)"
    );
  }
}

/** Start the cashout reconciliation cron. Runs every 10 minutes. Returns a cleanup function. */
export function startCashoutReconciliation(): () => void {
  processCashoutReconciliation().catch((err: unknown) =>
    logger.error({ err }, "cashout-reconciliation: startup run failed")
  );
  const interval = setInterval(() => {
    processCashoutReconciliation().catch((err: unknown) =>
      logger.error({ err }, "cashout-reconciliation: scheduled run failed")
    );
  }, TEN_MINUTES_MS);

  logger.info({ intervalMs: TEN_MINUTES_MS }, "cashout-reconciliation: cron started");

  return () => {
    clearInterval(interval);
    logger.info("cashout-reconciliation: cron stopped");
  };
}
