import { db, communityPoolLedgerTable, communityPoolFinancialEventsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import {
  findMissingPoolPaymentIntentRecords,
  type MissingPoolPaymentIntentRecord,
} from "./pool-stripe-audit";

export const POOL_STRIPE_RECONCILIATION_MAX_PAGES = 5;

export interface PoolStripeReconciliationResult {
  pages_scanned: number;
  truncated: boolean;
  pool_payment_intents_scanned: number;
  missing_ledger_count: number;
  missing_financial_event_count: number;
  duplicate_ledger_count: number;
  missing: MissingPoolPaymentIntentRecord[];
}

export async function scanRecentPoolContributions(
  stripe: Stripe,
  lookbackDays: number,
  maxPages = POOL_STRIPE_RECONCILIATION_MAX_PAGES,
): Promise<PoolStripeReconciliationResult> {
  const since = Math.floor(Date.now() / 1000) - lookbackDays * 86400;
  const missing: MissingPoolPaymentIntentRecord[] = [];
  let pagesScanned = 0;
  let poolPaymentIntentsScanned = 0;
  let truncated = false;
  let startingAfter: string | undefined;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: since },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    pagesScanned += 1;

    const poolPayments = page.data.filter(
      paymentIntent =>
        paymentIntent.status === "succeeded" &&
        paymentIntent.metadata?.["pool_contribution"] === "true",
    );
    poolPaymentIntentsScanned += poolPayments.length;

    if (poolPayments.length > 0) {
      const paymentIntentIds = poolPayments.map(paymentIntent => paymentIntent.id);
      const ledgerRecords = await db
        .select({
          paymentIntentId: communityPoolLedgerTable.stripe_payment_intent_id,
          ledgerId: communityPoolLedgerTable.id,
          financialEventId: communityPoolFinancialEventsTable.id,
        })
        .from(communityPoolLedgerTable)
        .leftJoin(
          communityPoolFinancialEventsTable,
          eq(
            communityPoolFinancialEventsTable.community_pool_ledger_id,
            communityPoolLedgerTable.id,
          ),
        )
        .where(inArray(communityPoolLedgerTable.stripe_payment_intent_id, paymentIntentIds));

      missing.push(...findMissingPoolPaymentIntentRecords(poolPayments, ledgerRecords));
    }

    if (!page.has_more || page.data.length === 0) break;
    if (pageNumber === maxPages - 1) {
      truncated = true;
      break;
    }
    startingAfter = page.data[page.data.length - 1]?.id;
  }

  return {
    pages_scanned: pagesScanned,
    truncated,
    pool_payment_intents_scanned: poolPaymentIntentsScanned,
    missing_ledger_count: missing.filter(record => record.missing_ledger).length,
    missing_financial_event_count: missing.filter(record => record.missing_financial_event).length,
    duplicate_ledger_count: missing.reduce((count, record) => count + record.duplicate_ledger_count, 0),
    missing,
  };
}
