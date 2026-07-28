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
import { db, scheduledPaymentsTable, walletCashoutsTable, usersTable, transactionsTable, civicInvoicesTable, civicNeedsTable, governmentSponsorsTable } from "@workspace/db";
import { eq, and, lte, sql, gte, lt } from "drizzle-orm";
import Stripe from "stripe";
import { sendPushToUser } from "../routes/push";
import { logger } from "./logger";
import { isAmbiguousStripeError } from "./stripe-errors";
import { buildCashoutTransferParams, cashoutIdempotencyKey } from "./stripe-cashout";
import { workerRan } from "./worker-registry";

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
        .catch(err => logger.warn({ err, payment_id: payment.id }, "scheduled-payment reminder: last_reminder_sent_at update failed — continuing"));
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
          // Completed but within 2 years — no point nudging ancient rows
          sql`${requestsTable.completed_at} > NOW() - INTERVAL '730 days'`,
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
// After 2 years with no repayment, a PIF pledge is considered defaulted.
// This worker:
//   1. Finds completed PIF requests with pledge_paid=0 after the 2-year grace window
//   2. Sets pledge_status='defaulted'
//   3. Applies a trust-score penalty (-10 points, floored at 0)
//   4. Logs the action for the admin audit trail
//
// Grace window is intentionally generous (730 days / 2 years) — the whole point
// of pay-it-forward is "no pressure, pay when life gets better." A 90-day hard
// default contradicted the mission and quietly blocked people at day 91.
//
// "Defaulted" is a soft internal risk signal + trust-score ding. It does NOT
// hard-block new PIF requests — the requester can still use the platform.
// Admin can restore pledge_status manually at any time.

const PLEDGE_DEFAULT_DAYS = 730;

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
          // MAKE_INTERVAL is fully parameterized — avoids sql.raw for interval construction.
          sql`${requestsTable.completed_at} < NOW() - MAKE_INTERVAL(days => ${PLEDGE_DEFAULT_DAYS})`,
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
        title: "💙 Pay It Forward — Pledge Update",
        body: `Your pledge has been marked as overdue after ${PLEDGE_DEFAULT_DAYS / 365} years. When you're able, even a small payment keeps the cycle going for the next neighbor. No rush — we're here for you.`,
        urgency: "normal",
        notifType: "wallet" as const,
      }).catch(err => logger.warn({ err, requester_id: req.requester_id }, "sendPushToUser (pledge-default): non-critical side effect failed — continuing"));

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
                  `Your Pay It Forward pledge has been marked as overdue after ${PLEDGE_DEFAULT_DAYS / 365} years without repayment.`,
                  "This is a gentle signal, not a hard block — you can still use the platform.",
                  "",
                  "When life gets better, make any payment — even a small one — in your Niakofa wallet to keep the cycle going for the next neighbor.",
                  "Or submit a hardship request if you're going through a difficult time and need a waiver.",
                ].join("\n"),
                ctaText: "Open My Wallet",
                ctaUrl: `${process.env["APP_URL"] ?? "https://niakofa.com"}/wallet`,
              }).catch(err => logger.warn({ err }, "sendAlertEmail (pledge-default): non-critical side effect failed — continuing"))
            )
            .catch(err => logger.warn({ err }, "sendAlertEmail (pledge-default): non-critical side effect failed — continuing"));
        })
        .catch(err => logger.warn({ err }, "pledge-default: email lookup failed — continuing"));

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
  processPledgeDefaults().then(() => workerRan("pledge-defaults", true)).catch(() => { workerRan("pledge-defaults", false); });
  const interval = setInterval(() => {
    processPledgeDefaults().then(() => workerRan("pledge-defaults", true)).catch(() => { workerRan("pledge-defaults", false); });
  }, TWELVE_HOURS_MS);

  logger.info({ intervalMs: TWELVE_HOURS_MS, grace_days: PLEDGE_DEFAULT_DAYS }, "scheduler: pledge default worker started");

  return () => {
    clearInterval(interval);
    logger.info("scheduler: pledge default worker stopped");
  };
}

/** Start the Pay-It-Forward repayment nudge worker. Runs every 6 hours. */
export function startPifNudgeWorker(): () => void {
  processPifNudges().then(() => workerRan("pif-nudge", true)).catch(() => { workerRan("pif-nudge", false); });
  const interval = setInterval(() => {
    processPifNudges().then(() => workerRan("pif-nudge", true)).catch(() => { workerRan("pif-nudge", false); });
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
  processScheduledReminders().then(() => workerRan("payment-reminder", true)).catch(() => { workerRan("payment-reminder", false); });
  const interval = setInterval(() => {
    processScheduledReminders().then(() => workerRan("payment-reminder", true)).catch(() => { workerRan("payment-reminder", false); });
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

  // wallet_cashouts.user_id is nullable (ON DELETE SET NULL) — the account
  // that owned this cashout may have been deleted since it was created.
  // We can still probe/confirm the Stripe transfer, but we can never write a
  // wallet credit/debit or ledger entry against a null user_id (there's no
  // wallet left to credit), so treat it the same as a missing destination:
  // escalate for manual review instead of guessing.
  if (user_id == null) {
    logger.error(
      { cashout_id, state },
      "cashout-reconciliation: cashout's user_id is null (account deleted) — marking reconciliation_required"
    );
    await db
      .update(walletCashoutsTable)
      .set({ state: "reconciliation_required", notes: "Owning account was deleted — manual review required", updated_at: new Date() })
      .where(sql`${walletCashoutsTable.id} = ${cashout_id} AND ${walletCashoutsTable.state} IN ('pending', 'failed')`);
    return;
  }

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
  processCashoutReconciliation().then(() => workerRan("cashout-recon", true)).catch((err: unknown) => {
    logger.error({ err }, "cashout-reconciliation: startup run failed");
    workerRan("cashout-recon", false);
  });
  const interval = setInterval(() => {
    processCashoutReconciliation().then(() => workerRan("cashout-recon", true)).catch((err: unknown) => {
      logger.error({ err }, "cashout-reconciliation: scheduled run failed");
      workerRan("cashout-recon", false);
    });
  }, TEN_MINUTES_MS);

  logger.info({ intervalMs: TEN_MINUTES_MS }, "cashout-reconciliation: cron started");

  return () => {
    clearInterval(interval);
    logger.info("cashout-reconciliation: cron stopped");
  };
}

// ─── Ledger/Stripe Drift Monitor ─────────────────────────────────────────────
// Runs once per day. Compares the Community Pool ledger balance against the
// actual Stripe platform balance. Drift > $10 triggers a structured WARN log
// so monitoring tooling and admin dashboards can surface it.
//
// This automates the previously manual-only GET /admin/pool/stripe-balance
// endpoint (which was a silent on-demand check — the audit flagged that
// silent ledger drift is the failure mode you most want to catch early once
// real money and real counties are involved).

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DRIFT_ALERT_THRESHOLD = 10; // dollars

async function checkLedgerStripeDrift(): Promise<void> {
  const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
  if (!STRIPE_SECRET_KEY) {
    logger.debug("ledger-drift: STRIPE_SECRET_KEY not configured — skipping daily drift check");
    return;
  }

  try {
    const { db, communityPoolLedgerTable } = await import("@workspace/db");
    const { sql: sqlTag } = await import("drizzle-orm");

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });

    // Ledger balance
    const [balRow] = await db
      .select({ balance: sqlTag<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
      .from(communityPoolLedgerTable);
    const ledgerBalance = balRow?.balance ?? 0;

    // Stripe balance
    const stripeBalance = await stripe.balance.retrieve();
    const available = stripeBalance.available
      .filter((b: { currency: string }) => b.currency === "usd")
      .reduce((s: number, b: { amount: number }) => s + b.amount, 0) / 100;
    const pending = stripeBalance.pending
      .filter((b: { currency: string }) => b.currency === "usd")
      .reduce((s: number, b: { amount: number }) => s + b.amount, 0) / 100;
    const stripeTotal = available + pending;

    const drift = Math.abs(stripeTotal - ledgerBalance);

    if (drift > DRIFT_ALERT_THRESHOLD) {
      logger.warn(
        {
          ledger_balance: ledgerBalance,
          stripe_available: available,
          stripe_pending: pending,
          stripe_total: stripeTotal,
          drift,
          threshold: DRIFT_ALERT_THRESHOLD,
        },
        "ledger-drift: DAILY CHECK — ledger vs Stripe gap exceeds $10. " +
        "Review the pool ledger and Stripe dashboard. " +
        "Possible causes: missed webhook, unrecorded fee, ledger bug. " +
        "Also visible at GET /api/admin/pool/stripe-balance."
      );
    } else {
      logger.info(
        { ledger_balance: ledgerBalance, stripe_total: stripeTotal, drift },
        "ledger-drift: daily check OK — ledger and Stripe within $10"
      );
    }
  } catch (err) {
    logger.error({ err }, "ledger-drift: daily check failed — non-fatal, will retry tomorrow");
  }
}

// ─── NET30 Invoice Reminder Worker ──────────────────────────────────────────
// Runs daily. Finds civic invoices that are pending and due within 7 days,
// then sends a push notification reminder to the sponsoring government entity.
// This addresses the gap: sponsors need advance notice before their NET30 due
// date so nothing slips through the cracks.

const _net30ReminderSent = new Set<string>(); // in-memory dedup (per restart)

async function processNet30InvoiceReminders(): Promise<void> {
  const { db: dbI, civicInvoicesTable: ciTable, civicNeedsTable: cnTable, governmentSponsorsTable: gsTable, usersTable: uTable } = await import("@workspace/db");
  const { and: andI, eq: eqI, sql: sqlI, lte: lteI, gte: gteI } = await import("drizzle-orm");

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let upcoming: { invoice_id: number; due_date: string; amount: string; need_title: string; sponsor_user_id: number; entity_name: string }[] = [];
  try {
    upcoming = await dbI
      .select({
        invoice_id: ciTable.id,
        due_date:   ciTable.due_date,
        amount:     ciTable.amount,
        need_title: cnTable.title,
        sponsor_user_id: gsTable.submitted_by_user_id,
        entity_name: gsTable.entity_name,
      })
      .from(ciTable)
      .innerJoin(cnTable, eqI(ciTable.civic_need_id, cnTable.id))
      .innerJoin(gsTable, eqI(cnTable.government_sponsor_id, gsTable.id))
      .where(
        andI(
          eqI(ciTable.status, "pending"),
          // Due within the next 7 days
          lteI(sqlI`${ciTable.due_date}::date`, sevenDaysFromNow),
          // Not already overdue (reminder, not dunning)
          gteI(sqlI`${ciTable.due_date}::date`, now),
        )
      )
      .limit(50);
  } catch (err) {
    logger.error({ err }, "net30-reminder: query failed");
    return;
  }

  if (upcoming.length === 0) return;
  logger.info({ count: upcoming.length }, "net30-reminder: sending invoice reminders");

  for (const row of upcoming) {
    const key = `${row.invoice_id}`;
    if (_net30ReminderSent.has(key)) continue;
    _net30ReminderSent.add(key);

    const dueDateLabel = new Date(row.due_date).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
    const daysUntilDue = Math.ceil((new Date(row.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    try {
      await sendPushToUser(row.sponsor_user_id, {
        title: "📋 Invoice Due Soon — Niakofa",
        body: `Your invoice for "${row.need_title}" (${Number(row.amount).toFixed(2)}) is due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""} on ${dueDateLabel}.`,
        urgency: "normal",
        notifType: "wallet" as const,
      });
      logger.info({ invoice_id: row.invoice_id, due_date: row.due_date, days: daysUntilDue }, "net30-reminder: reminder sent");
    } catch {
      // Never throw — keep processing other invoices
    }
  }
}

/** Start the NET30 invoice reminder worker. Runs daily. Returns a cleanup function. */
export function startNet30InvoiceReminderWorker(): () => void {
  // First run after 2 min startup delay so DB is fully ready
  const startupDelay = setTimeout(() => {
    processNet30InvoiceReminders().then(() => workerRan("net30-invoices", true)).catch((err: unknown) => {
      logger.error({ err }, "net30-reminder: startup run failed");
      workerRan("net30-invoices", false);
    });
  }, 2 * 60 * 1000);

  const interval = setInterval(() => {
    processNet30InvoiceReminders().then(() => workerRan("net30-invoices", true)).catch((err: unknown) => {
      logger.error({ err }, "net30-reminder: daily run failed");
      workerRan("net30-invoices", false);
    });
  }, ONE_DAY_MS);

  logger.info({ intervalMs: ONE_DAY_MS }, "net30-reminder: daily reminder worker started");

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("net30-reminder: worker stopped");
  };
}

/** Start the daily ledger/Stripe drift monitor. Returns a cleanup function. */
export function startLedgerDriftMonitor(): () => void {
  // Run once at a short delay after startup so it doesn't block boot,
  // then daily thereafter.
  const startupDelay = setTimeout(() => {
    checkLedgerStripeDrift().then(() => workerRan("ledger-drift", true)).catch((err: unknown) => {
      logger.error({ err }, "ledger-drift: startup run failed");
      workerRan("ledger-drift", false);
    });
  }, 5 * 60 * 1000); // 5 min after boot

  const interval = setInterval(() => {
    checkLedgerStripeDrift().then(() => workerRan("ledger-drift", true)).catch((err: unknown) => {
      logger.error({ err }, "ledger-drift: daily run failed");
      workerRan("ledger-drift", false);
    });
  }, ONE_DAY_MS);

  logger.info({ intervalMs: ONE_DAY_MS }, "ledger-drift: daily monitor started");

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("ledger-drift: monitor stopped");
  };
}
