import {
  db,
  communityPoolLedgerTable,
  systemSettingsTable,
  usersTable,
  transactionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

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

/**
 * Atomically debit the pool and credit the helper's benevolence_wallet.
 * Returns true if the payment went through, false if the pool couldn't cover
 * it (or the request was already fronted/minimum'd — unique partial indexes
 * make duplicates impossible).
 */
export async function payHelperFromPool(params: PoolDebitParams): Promise<boolean> {
  const { entryType, requestId, helperId, requestTitle } = params;
  const amount = roundMoney(params.amount);
  if (amount <= 0) return false;

  try {
    return await db.transaction(async (tx) => {
      // Serialize pool debits — balance check + debit must be atomic.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${POOL_LOCK_KEY})`);

      const [balRow] = await tx
        .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
        .from(communityPoolLedgerTable);
      const balance = balRow?.balance ?? 0;

      // Compare in whole cents so float representation noise can't flip the check
      if (toCents(balance) < toCents(amount)) {
        logger.info(
          { request_id: requestId, helper_id: helperId, balance, needed: amount, entry_type: entryType },
          "Community pool balance insufficient — skipping"
        );
        return false;
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

      return true;
    });
  } catch (err: unknown) {
    // Unique-violation = already paid for this request — treat as success=false, no retry needed
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      logger.warn({ request_id: requestId, entry_type: entryType }, "Pool entry already exists for request — skipped duplicate");
      return false;
    }
    logger.error({ err, request_id: requestId, helper_id: helperId }, "Pool payment failed");
    return false;
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
