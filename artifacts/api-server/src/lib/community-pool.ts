import {
  db,
  communityPoolLedgerTable,
  poolPendingMinimumsTable,
  systemSettingsTable,
  usersTable,
  transactionsTable,
} from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { broadcast } from "./ws-hub";

/**
 * Community Pool service.
 *
 * The pool fronts helper payments immediately when a pay-it-forward request
 * completes and pays a guaranteed minimum per completed task. All debits are
 * serialized with a transaction-scoped advisory lock so two simultaneous
 * completions can never overdraw the pool.
 */

// Advisory lock key for pool debits. Distinct from the migration lock (727501).
const POOL_LOCK_KEY = 727502;

/** Round a dollar amount to whole cents to avoid float drift in pool math. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Round a dollar amount to a cents-exact dollar value. */
export function roundMoney(dollars: number): number {
  return toCents(dollars) / 100;
}

export async function isPoolEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pool_enabled"))
      .limit(1);
    // Default ON when the setting row is missing
    return row ? row.value === "true" : true;
  } catch {
    return false;
  }
}

export async function getGuaranteedMinimum(): Promise<number> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pool_guaranteed_minimum"))
      .limit(1);
    const parsed = row ? parseFloat(row.value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function getPoolBalance(): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
    .from(communityPoolLedgerTable);
  return row?.balance ?? 0;
}

interface PoolDebitParams {
  entryType: "helper_front" | "guaranteed_minimum";
  amount: number; // positive dollars to pay OUT of the pool
  requestId: number;
  helperId: number;
  requestTitle: string;
}

/** Outcome of a pool debit attempt — callers must distinguish these. */
export type PoolPayOutcome = "paid" | "insufficient" | "duplicate" | "error";

/**
 * Atomically debit the pool and credit the helper's benevolence_wallet.
 * Returns "paid" on success, "insufficient" when the pool can't cover it,
 * "duplicate" when this request was already fronted/minimum'd (unique partial
 * indexes make double-pay impossible), "error" on unexpected failure.
 */
export async function payHelperFromPool(params: PoolDebitParams): Promise<PoolPayOutcome> {
  const { entryType, requestId, helperId, requestTitle } = params;
  const amount = roundMoney(params.amount);
  if (amount <= 0) return "error";

  try {
    return await db.transaction(async (tx): Promise<PoolPayOutcome> => {
      // Serialize pool debits — balance check + debit must be atomic.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${POOL_LOCK_KEY})`);

      const [balRow] = await tx
        .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
        .from(communityPoolLedgerTable);
      const balance = balRow?.balance ?? 0;

      // Compare in whole cents so float representation noise can't flip the check
      if (toCents(balance) < toCents(amount)) {
        logger.warn(
          { request_id: requestId, helper_id: helperId, balance, needed: amount, entry_type: entryType },
          "Community pool balance insufficient — payment skipped"
        );
        return "insufficient";
      }

      // Debit the pool. The partial unique indexes on (request_id) for
      // helper_front / guaranteed_minimum throw on duplicates, aborting the
      // transaction — no double-pay possible.
      await tx.insert(communityPoolLedgerTable).values({
        entry_type: entryType,
        amount: -amount,
        request_id: requestId,
        user_id: helperId,
        notes:
          entryType === "helper_front"
            ? `Pool fronted helper payment for: ${requestTitle}`
            : `Guaranteed minimum for completed task: ${requestTitle}`,
      });

      // Credit the helper's Goodwill Fund
      await tx
        .update(usersTable)
        .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amount}` })
        .where(eq(usersTable.id, helperId));

      // Helper-visible ledger entry
      await tx.insert(transactionsTable).values({
        user_id: helperId,
        request_id: requestId,
        type: "pledge_received",
        amount,
        description:
          entryType === "helper_front"
            ? `Community Pool paid you now for: ${requestTitle}`
            : `Community Pool thank-you minimum: ${requestTitle}`,
      });

      return "paid";
    });
  } catch (err: unknown) {
    // Unique-violation = already paid for this request — safe skip, no retry needed
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      logger.warn({ request_id: requestId, entry_type: entryType }, "Pool entry already exists for request — skipped duplicate");
      return "duplicate";
    }
    logger.error({ err, request_id: requestId, helper_id: helperId }, "Pool payment failed");
    return "error";
  }
}

/** Has the pool fronted this request's helper payment? */
export async function wasRequestFronted(requestId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: communityPoolLedgerTable.id })
    .from(communityPoolLedgerTable)
    .where(
      sql`${communityPoolLedgerTable.request_id} = ${requestId} AND ${communityPoolLedgerTable.entry_type} = 'helper_front'`
    )
    .limit(1);
  return !!row;
}

/** Record a repayment flowing back into the pool (requester repaid a fronted pledge). */
export async function recordPoolRepayment(params: {
  amount: number;
  requestId: number;
  requesterId: number | null;
  stripePaymentIntentId?: string;
}): Promise<void> {
  const { requestId, requesterId, stripePaymentIntentId } = params;
  const amount = roundMoney(params.amount);
  if (amount <= 0) return;
  await db.insert(communityPoolLedgerTable).values({
    entry_type: "pledge_repayment",
    amount,
    request_id: requestId,
    user_id: requesterId,
    stripe_payment_intent_id: stripePaymentIntentId ?? null,
    notes: "Requester repaid a pool-fronted pledge — pool replenished",
  });
}

/**
 * Queue a guaranteed minimum the pool couldn't cover. The backfill worker
 * retries these FIFO whenever the pool is replenished — no helper silently
 * loses their guarantee. Unique index on request_id = queue-once.
 */
export async function queuePendingMinimum(params: {
  requestId: number;
  helperId: number;
  amount: number;
  requestTitle: string;
}): Promise<void> {
  const amount = roundMoney(params.amount);
  if (amount <= 0) return;
  try {
    await db
      .insert(poolPendingMinimumsTable)
      .values({
        request_id: params.requestId,
        helper_id: params.helperId,
        amount,
        request_title: params.requestTitle,
      })
      .onConflictDoNothing();
    logger.warn(
      { request_id: params.requestId, helper_id: params.helperId, amount },
      "Guaranteed minimum QUEUED — pool balance insufficient, will backfill when replenished"
    );
  } catch (err) {
    logger.error({ err, request_id: params.requestId }, "Failed to queue pending minimum");
  }
}

/**
 * Backfill queued guaranteed minimums (FIFO) while the pool can cover them.
 * Called after every pool credit (contribution / repayment) and by the
 * interval worker as a safety net. Returns how many were paid.
 */
export async function processPendingMinimums(): Promise<number> {
  if (!(await isPoolEnabled())) return 0;

  let paidCount = 0;
  try {
    const pending = await db
      .select()
      .from(poolPendingMinimumsTable)
      .where(eq(poolPendingMinimumsTable.status, "pending"))
      .orderBy(asc(poolPendingMinimumsTable.created_at))
      .limit(50);

    for (const row of pending) {
      const outcome = await payHelperFromPool({
        entryType: "guaranteed_minimum",
        amount: row.amount,
        requestId: row.request_id,
        helperId: row.helper_id,
        requestTitle: row.request_title,
      });

      if (outcome === "paid" || outcome === "duplicate") {
        // duplicate = a minimum already exists for this request — mark satisfied
        await db
          .update(poolPendingMinimumsTable)
          .set({ status: "paid", paid_at: new Date() })
          .where(eq(poolPendingMinimumsTable.id, row.id));
        if (outcome === "paid") {
          paidCount++;
          logger.info(
            { request_id: row.request_id, helper_id: row.helper_id, amount: row.amount },
            "Backfilled guaranteed minimum from replenished pool"
          );
          // Lazy import avoids a circular dependency (routes/push imports lib modules)
          const { sendPushToUser } = await import("../routes/push");
          sendPushToUser(row.helper_id, {
            title: "💙 Community Pool Thank-You (backfilled)",
            body: `The pool was replenished — $${row.amount.toFixed(2)} was just added to your Goodwill Fund for: "${row.request_title}".`,
            requestId: row.request_id,
            notifType: "wallet" as const,
          }).catch(() => {});
        }
      } else if (outcome === "insufficient") {
        // FIFO: stop at the first one the pool can't cover
        break;
      }
      // "error": leave pending, move on next cycle
    }

    if (paidCount > 0) {
      const balance = await getPoolBalance();
      broadcast({ type: "pool_updated", payload: { balance } });
    }
  } catch (err) {
    logger.error({ err }, "processPendingMinimums failed");
  }
  return paidCount;
}

// ── Low-balance admin alert ──────────────────────────────────────────────────

const LOW_BALANCE_ALERT_INTERVAL_MS = 6 * 60 * 60 * 1000; // at most once per 6h
let _lastLowBalanceAlertAt = 0;

export async function getLowBalanceThreshold(): Promise<number> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pool_low_balance_threshold"))
      .limit(1);
    const parsed = row ? parseFloat(row.value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 25;
  } catch {
    return 25;
  }
}

/**
 * If the pool balance is below the alert threshold, warn admins: warn-level
 * log, `pool_low_balance` WS broadcast, and a push to every is_admin user.
 * Deduped to once per 6 hours per process.
 */
export async function maybeAlertLowBalance(): Promise<void> {
  try {
    const [balance, threshold] = await Promise.all([getPoolBalance(), getLowBalanceThreshold()]);
    if (toCents(balance) >= toCents(threshold)) return;
    if (Date.now() - _lastLowBalanceAlertAt < LOW_BALANCE_ALERT_INTERVAL_MS) return;
    _lastLowBalanceAlertAt = Date.now();

    logger.warn({ balance, threshold }, "COMMUNITY POOL LOW BALANCE — guaranteed minimums at risk");
    broadcast({ type: "pool_low_balance", payload: { balance, threshold } });

    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.is_admin, true));
    // Lazy import avoids a circular dependency (routes/push imports lib modules)
    const { sendPushToUser } = await import("../routes/push");
    for (const admin of admins) {
      sendPushToUser(admin.id, {
        title: "⚠️ Community Pool low balance",
        body: `Pool balance is $${balance.toFixed(2)} (threshold $${threshold.toFixed(2)}). Guaranteed minimums may be queued until the pool is replenished.`,
        notifType: "wallet" as const,
      }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "maybeAlertLowBalance failed");
  }
}

/** Record a sponsor contribution into the pool. */
export async function recordPoolContribution(params: {
  amount: number;
  userId: number | null;
  stripePaymentIntentId?: string;
  notes?: string;
}): Promise<boolean> {
  const { userId, stripePaymentIntentId, notes } = params;
  const amount = roundMoney(params.amount);
  if (amount <= 0) return false;
  try {
    await db.insert(communityPoolLedgerTable).values({
      entry_type: "sponsor_contribution",
      amount,
      user_id: userId,
      stripe_payment_intent_id: stripePaymentIntentId ?? null,
      notes: notes ?? "Sponsor contribution to the Community Pool",
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      // Webhook retry — contribution already recorded for this payment intent
      logger.info({ stripe_pi: stripePaymentIntentId }, "Pool contribution already recorded — webhook retry ignored");
      return false;
    }
    throw err;
  }
}
