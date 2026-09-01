/**
 * Advance pending Community Pool Stripe settlements from live Balance
 * Transaction status. This never estimates or changes money amounts.
 */
import type Stripe from "stripe";
import StripeClient from "stripe";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, communityPoolFinancialEventsTable } from "@workspace/db";
import { broadcast } from "./ws-hub";
import { getPoolBalance } from "./community-pool";
import { logger } from "./logger";
import { workerRan } from "./worker-registry";

export async function advancePendingPoolSettlements(
  stripe: Stripe,
  options?: { limit?: number },
): Promise<{ examined: number; advanced: number }> {
  const pending = await db
    .select({
      id: communityPoolFinancialEventsTable.id,
      btId: communityPoolFinancialEventsTable.stripe_balance_transaction_id,
      ledgerId: communityPoolFinancialEventsTable.community_pool_ledger_id,
      userId: communityPoolFinancialEventsTable.user_id,
    })
    .from(communityPoolFinancialEventsTable)
    .where(
      and(
        inArray(communityPoolFinancialEventsTable.settlement_status, ["pending"]),
        isNotNull(communityPoolFinancialEventsTable.stripe_balance_transaction_id),
      ),
    )
    .limit(options?.limit ?? 50);

  let advanced = 0;
  for (const row of pending) {
    if (!row.btId) continue;
    try {
      const balanceTransaction = await stripe.balanceTransactions.retrieve(row.btId);
      if (balanceTransaction.status !== "available") continue;

      await db.transaction(async (tx) => {
        await tx
          .update(communityPoolFinancialEventsTable)
          .set({
            settlement_status: "available",
            available_on: balanceTransaction.available_on
              ? new Date(balanceTransaction.available_on * 1000)
              : new Date(),
            updated_at: new Date(),
          })
          .where(
            and(
              eq(communityPoolFinancialEventsTable.id, row.id),
              eq(communityPoolFinancialEventsTable.settlement_status, "pending"),
            ),
          );

        if (row.userId != null && row.ledgerId != null) {
          await tx.execute(sql`
            UPDATE transactions
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'settlement_status', 'available',
              'available_on', ${balanceTransaction.available_on
                ? new Date(balanceTransaction.available_on * 1000).toISOString()
                : null}
            )
            WHERE user_id = ${row.userId}
              AND type = 'pool_contribution'
              AND related_pool_ledger_id = ${row.ledgerId}
              AND COALESCE(metadata->>'kind', '') <> 'pool_contribution_refund'
          `);
        }
      });
      advanced += 1;
    } catch (err) {
      logger.warn({ err, financial_event_id: row.id }, "pool settlement advancement skipped");
    }
  }

  return { examined: pending.length, advanced };
}

/**
 * The pool balance is net of settlement deductions, so a lightweight
 * development-safe interval is sufficient. Production has Stripe credentials
 * guarded at API startup; no `paid_out` transition is inferred here.
 */
export function startPoolSettlementStatusWorker(): () => void {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    logger.warn("pool-settlement-worker: Stripe not configured — advancement disabled");
    return () => undefined;
  }

  const stripe = new StripeClient(secretKey, {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
  });
  const intervalMs = 15 * 60 * 1000;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await advancePendingPoolSettlements(stripe);
      workerRan("pool-settlement", true);
      if (result.advanced > 0) {
        broadcast({ type: "pool_updated", payload: { balance: await getPoolBalance() } });
        logger.info(result, "pool-settlement-worker: advanced pending settlements");
      }
    } catch (err) {
      workerRan("pool-settlement", false);
      logger.warn({ err }, "pool-settlement-worker: run failed");
    } finally {
      running = false;
    }
  };

  const startupTimer = setTimeout(() => void run(), 30_000);
  const interval = setInterval(() => void run(), intervalMs);
  logger.info({ intervalMs }, "pool-settlement-worker: started");
  return () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
  };
}