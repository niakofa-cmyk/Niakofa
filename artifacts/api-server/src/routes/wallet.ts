/**
 * Wallet Routes — Benevolence wallet cash-out ("last mile" for PIF / pool earnings)
 *
 * POST /wallet/cashout
 *   Transfers a helper's benevolence_wallet balance (or a portion) to their
 *   connected Stripe bank account via stripe.transfers.create.
 *
 *   Three-phase flow — prevents both double-spend and concurrent over-pay:
 *
 *   Phase 1 — Reserve (DB transaction with row lock):
 *     • SELECT … FOR UPDATE on the users row — serializes concurrent requests
 *     • Validate: is_helper, approved, balance ≥ amount, payouts_enabled
 *     • Decrement benevolence_wallet immediately (the "reservation" — prevents a
 *       second concurrent request from seeing the same balance and over-spending)
 *     • INSERT wallet_cashouts with state='pending'
 *     • COMMIT (lock released; balance already decremented)
 *
 *   Phase 2 — Stripe transfer (outside DB transaction):
 *     • stripe.transfers.create with idempotencyKey: `cashout-${row.id}`
 *     • On success → Phase 3
 *     • On failure → mark row 'failed', **refund** the decremented balance,
 *       enqueue BullMQ retry; respond 502
 *
 *   Phase 3 — Commit (DB transaction):
 *     • UPDATE wallet_cashouts SET state='completed' WHERE id=? AND state='pending'
 *       (state guard = idempotency: retries and webhook find state≠'pending' → skip)
 *     • INSERT transactions ledger entry (no balance change — already decremented)
 *     • COMMIT
 *     • WS broadcast
 *
 *   Worker retries (cashout-worker.ts):
 *     • Balance is already decremented from Phase 1; worker only fires Stripe and
 *       marks completed. On final failure the worker refunds the wallet.
 *
 * GET /wallet/cashout/history
 *   Returns the authenticated helper's cashout rows (up to 50), newest first.
 */
import { Router, type Request, type Response } from "express";
import { requireAuth, requireApproved } from "../middlewares/auth";
import Stripe from "stripe";
import {
  db,
  walletCashoutsTable,
  usersTable,
  stripeAccountsTable,
  transactionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { paymentLimiter } from "../middlewares/rate-limit";
import { enqueueCashoutRetry } from "../lib/queue";
import { buildCashoutTransferParams, cashoutIdempotencyKey } from "../lib/stripe-cashout";

const router = Router();

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

// ── POST /wallet/cashout ──────────────────────────────────────────────────────
router.post(
  "/wallet/cashout",
  requireAuth,
  requireApproved,
  paymentLimiter,
  async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(503).json({
        error: "Stripe is not configured.",
        setup: "Set STRIPE_SECRET_KEY to enable wallet cashouts.",
      });
    }

    const userId = req.authenticatedUserId!;
    const body = req.body as { amount?: number; description?: string };
    const requestedAmount = typeof body.amount === "number" ? body.amount : null;

    if (!requestedAmount || requestedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number (USD)" });
    }
    if (requestedAmount < 1) {
      return res.status(400).json({ error: "Minimum cashout is $1.00" });
    }

    // ── Phase 1: Lock + validate + RESERVE (debit the wallet now) ─────────────
    // All of this is ONE DB transaction with a row-level FOR UPDATE lock so that
    // concurrent cashout requests are serialized. The wallet is decremented
    // immediately inside the lock — this is the "reservation" that prevents any
    // concurrent request from seeing the same balance and over-spending.
    let cashoutRowId!: number;
    let stripeAccountId!: string;
    let walletBalanceBefore!: number;

    try {
      await db.transaction(async (tx) => {
        // Row-level lock — concurrent requests queue here, not at the balance check
        type UserRow = { id: number; benevolence_wallet: number; is_helper: boolean };
        const rows = await tx.execute(
          sql`SELECT id, benevolence_wallet, is_helper FROM users WHERE id = ${userId} FOR UPDATE`
        ) as unknown as UserRow[];
        const user = Array.isArray(rows) ? rows[0] : (rows as { rows?: UserRow[] })?.rows?.[0];

        if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
        if (!user.is_helper) {
          throw Object.assign(new Error("Only helpers can cash out"), { statusCode: 403 });
        }

        walletBalanceBefore = user.benevolence_wallet ?? 0;
        if (requestedAmount > walletBalanceBefore) {
          throw Object.assign(new Error("Insufficient wallet balance"), {
            statusCode: 400,
            extra: { balance: walletBalanceBefore, requested: requestedAmount },
          });
        }

        // Verify Stripe Connect account (inside same tx for consistent read)
        const acctRows = await tx
          .select({
            stripe_account_id: stripeAccountsTable.stripe_account_id,
            payouts_enabled: stripeAccountsTable.payouts_enabled,
          })
          .from(stripeAccountsTable)
          .where(eq(stripeAccountsTable.user_id, userId))
          .limit(1);
        const acct = acctRows[0];

        if (!acct?.stripe_account_id) {
          throw Object.assign(
            new Error("No Stripe Connect account found. Please complete bank account setup first."),
            { statusCode: 400, extra: { code: "no_stripe_account" } }
          );
        }
        if (!acct.payouts_enabled) {
          throw Object.assign(
            new Error("Stripe payouts not yet enabled. Please finish Stripe Connect onboarding."),
            { statusCode: 400, extra: { code: "payouts_not_enabled" } }
          );
        }
        stripeAccountId = acct.stripe_account_id;

        // ── RESERVE: debit the wallet immediately under the lock ──────────────
        // This is the key safety step — no other concurrent request can see or
        // claim this balance because we hold the FOR UPDATE lock. After the
        // transaction commits, the balance is gone regardless of what Stripe does.
        await tx
          .update(usersTable)
          .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} - ${requestedAmount}` })
          .where(eq(usersTable.id, userId));

        // Insert the pending idempotency row — cashout_id is the stable
        // idempotency key for the Stripe call and all subsequent retries.
        const inserted = await tx
          .insert(walletCashoutsTable)
          .values({
            user_id: userId,
            amount: requestedAmount,
            state: "pending",
            stripe_account_id: acct.stripe_account_id,
            notes: body.description ?? `Goodwill Fund cashout: $${requestedAmount.toFixed(2)}`,
          })
          .returning({ id: walletCashoutsTable.id });
        cashoutRowId = inserted[0].id;
      });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number; extra?: Record<string, unknown> };
      const code = e.statusCode ?? 500;
      return res.status(code).json({ error: e.message, ...(e.extra ?? {}) });
    }

    const amountCents = Math.round(requestedAmount * 100);

    // ── Phase 2: Stripe transfer (outside DB transaction) ─────────────────────
    // Balance is already decremented. If this fails, we must refund it.
    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create(
        buildCashoutTransferParams({
          cashout_id: cashoutRowId,
          user_id: userId,
          stripe_account_id: stripeAccountId,
          amount_cents: amountCents,
        }),
        { idempotencyKey: cashoutIdempotencyKey(cashoutRowId) }
      );
    } catch (err: unknown) {
      // Stripe failed — wallet was decremented in Phase 1 and must stay decremented
      // until the retry worker succeeds or exhausts all attempts. DO NOT refund here.
      // The cashout-worker's final-failure handler is the sole refund path; it marks
      // the row 'permanently_failed' and restores the wallet only after all retries
      // are exhausted. Refunding here while enqueuing a retry would allow a successful
      // retry to overpay (balance restored + Stripe transfer = double payment).
      logger.error(
        { err, cashout_id: cashoutRowId, user_id: userId },
        "wallet cashout: Stripe transfer failed — balance reservation held, enqueuing retry"
      );

      await db
        .update(walletCashoutsTable)
        .set({
          state: "failed",
          notes: `Stripe error: ${err instanceof Error ? err.message : String(err)}`,
          updated_at: new Date(),
        })
        .where(eq(walletCashoutsTable.id, cashoutRowId));

      // Enqueue retry — the wallet reservation stays decremented until the retry
      // worker succeeds or exhausts all attempts (at which point the worker's
      // final-failure handler refunds the wallet and marks 'permanently_failed').
      //
      // We intentionally do NOT perform an immediate refund here even if the
      // enqueue call fails, because enqueueCashoutRetry has its own best-effort
      // semantics and a partial Redis ACK could still result in a queued job.
      // Refunding while an orphaned job may still fire Stripe would be a double-pay.
      //
      // Stale 'failed' rows (no retry + no transfer) are recovered by the
      // reconciliation cron (startCashoutReconciliation in scheduler.ts) which
      // runs every 10 minutes and refunds + marks 'permanently_failed' any row
      // that has been in 'failed' state for over 24 hours with no transfer.
      await enqueueCashoutRetry({
        cashout_id: cashoutRowId,
        user_id: userId,
        amount_cents: amountCents,
        stripe_account_id: stripeAccountId,
      }).catch((enqErr: unknown) => {
        // Log but do not refund — reconciliation cron is the recovery path
        logger.error(
          { enqErr, cashout_id: cashoutRowId, user_id: userId },
          "wallet cashout: retry enqueue failed — cashout stuck in 'failed' state; reconciliation cron will refund within 24 h"
        );
      });

      return res.status(502).json({
        error:
          "Transfer could not be initiated. Your balance is reserved and will be refunded automatically within 24 hours if retries fail.",
        code: "stripe_transfer_failed",
      });
    }

    // ── Phase 3: Mark completed and record ledger ──────────────────────────────
    // Balance was already decremented in Phase 1 — no balance change here.
    // State guard (WHERE state='pending') makes this idempotent for retries.
    try {
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(walletCashoutsTable)
          .set({
            state: "completed",
            stripe_transfer_id: transfer.id,
            updated_at: new Date(),
          })
          .where(
            sql`${walletCashoutsTable.id} = ${cashoutRowId} AND ${walletCashoutsTable.state} = 'pending'`
          )
          .returning({ id: walletCashoutsTable.id });

        if (!updated[0]) {
          // Another path already completed — safe no-op (do NOT re-add ledger)
          logger.info(
            { cashout_id: cashoutRowId, transfer_id: transfer.id },
            "wallet cashout: Phase 3 state guard hit — already completed by another path"
          );
          return;
        }

        // Ledger: negative amount = money left the wallet (balance already decremented)
        await tx.insert(transactionsTable).values({
          user_id: userId,
          type: "payout_sent",
          amount: -requestedAmount,
          description: `Goodwill Fund cashout via Stripe (${transfer.id})`,
        });
      });
    } catch (txErr) {
      // Transfer already sent — log for manual reconciliation but report success
      logger.error(
        { txErr, transfer_id: transfer.id, cashout_id: cashoutRowId, user_id: userId },
        "wallet cashout: Phase 3 DB update failed after successful Stripe transfer — MANUAL RECONCILIATION REQUIRED"
      );
      return res.status(207).json({
        warning:
          "Transfer succeeded but balance display may not have updated yet. Admin has been notified.",
        transferId: transfer.id,
        amount: requestedAmount,
      });
    }

    broadcast({
      type: "wallet_cashout",
      payload: {
        user_id: userId,
        amount: requestedAmount,
        transfer_id: transfer.id,
        new_balance: Math.max(0, walletBalanceBefore - requestedAmount),
      },
    });

    logger.info(
      { user_id: userId, cashout_id: cashoutRowId, transfer_id: transfer.id, amount: requestedAmount },
      "wallet cashout: completed successfully"
    );

    return res.json({
      success: true,
      transferId: transfer.id,
      amount: requestedAmount,
      newBalance: Math.max(0, walletBalanceBefore - requestedAmount),
    });
  }
);

// ── GET /admin/cashouts — admin overview of all cashout records ───────────────
// Returns latest 100 cashout records joined with user info for the admin panel.
// Ordered by most-recent first so stuck/failed rows surface immediately.
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { desc } from "drizzle-orm";

router.get("/admin/cashouts", requireAuth, adminLimiter, async (req: Request, res: Response) => {
  await requireAdmin()(req, res, async () => {
    const rows = await db
      .select({
        id: walletCashoutsTable.id,
        user_id: walletCashoutsTable.user_id,
        user_name: usersTable.name,
        user_email: usersTable.email,
        amount: walletCashoutsTable.amount,
        state: walletCashoutsTable.state,
        stripe_transfer_id: walletCashoutsTable.stripe_transfer_id,
        stripe_account_id: walletCashoutsTable.stripe_account_id,
        notes: walletCashoutsTable.notes,
        created_at: walletCashoutsTable.created_at,
        updated_at: walletCashoutsTable.updated_at,
      })
      .from(walletCashoutsTable)
      .leftJoin(usersTable, eq(usersTable.id, walletCashoutsTable.user_id))
      .orderBy(desc(walletCashoutsTable.created_at))
      .limit(100);
    return res.json(rows);
  });
});

// ── GET /wallet/cashout/history ───────────────────────────────────────────────
router.get("/wallet/cashout/history", requireAuth, requireApproved, async (req: Request, res: Response) => {
  const userId = req.authenticatedUserId!;
  const rows = await db
    .select()
    .from(walletCashoutsTable)
    .where(eq(walletCashoutsTable.user_id, userId))
    .orderBy(sql`${walletCashoutsTable.created_at} DESC`)
    .limit(50);
  return res.json(rows);
});

export default router;
