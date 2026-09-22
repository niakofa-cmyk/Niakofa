/**
 * Reverse a Community Pool contribution when Stripe refunds the charge.
 *
 * The pool ledger stores the settled net amount, so refunds reverse net rather
 * than guessing fees. Stripe's charge.amount_refunded is cumulative; the
 * helper calculates only the newly refundable portion and is safe for repeated
 * webhook deliveries and multiple partial refunds.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  communityPoolLedgerTable,
  communityPoolFinancialEventsTable,
  transactionsTable,
} from "@workspace/db";

function roundMoney(dollars: number): number {
  return Math.round(dollars * 100) / 100;
}

export interface ReversePoolContributionParams {
  stripePaymentIntentId: string;
  /** Cumulative cents refunded on the charge (Stripe charge.amount_refunded). */
  amountRefundedCents: number;
  /** Full charge amount in cents (for proportional partial refunds). */
  chargeAmountCents: number;
  /** Stable Stripe refund identity for idempotency. */
  refundIdempotencyKey: string;
}

export async function reversePoolContributionOnRefund(
  params: ReversePoolContributionParams,
): Promise<{ reversed: boolean; alreadyReversed: boolean; netReversedDollars: number }> {
  const {
    stripePaymentIntentId,
    amountRefundedCents,
    chargeAmountCents,
    refundIdempotencyKey,
  } = params;

  if (amountRefundedCents <= 0 || chargeAmountCents <= 0) {
    return { reversed: false, alreadyReversed: false, netReversedDollars: 0 };
  }

  return db.transaction(async (tx) => {
    // Serialize refunds for one original contribution. This matters when
    // Stripe delivers two partial-refund updates concurrently.
    await tx.execute(sql`
      SELECT id
      FROM community_pool_financial_events
      WHERE stripe_payment_intent_id = ${stripePaymentIntentId}
      FOR UPDATE
    `);

    const [event] = await tx
      .select()
      .from(communityPoolFinancialEventsTable)
      .where(eq(communityPoolFinancialEventsTable.stripe_payment_intent_id, stripePaymentIntentId))
      .limit(1);

    if (!event) {
      return { reversed: false, alreadyReversed: false, netReversedDollars: 0 };
    }

    const [existingReversal] = await tx
      .select({ id: communityPoolLedgerTable.id })
      .from(communityPoolLedgerTable)
      .where(
        and(
          eq(communityPoolLedgerTable.stripe_payment_intent_id, refundIdempotencyKey),
          eq(communityPoolLedgerTable.entry_type, "adjustment"),
        ),
      )
      .limit(1);
    if (existingReversal) {
      return { reversed: false, alreadyReversed: true, netReversedDollars: 0 };
    }

    const ratio = Math.min(1, amountRefundedCents / chargeAmountCents);
    const desiredNetReversedCents = Math.round(event.net_amount_cents * ratio);
    const priorReversed = await tx
      .select({
        total: sql<number>`COALESCE(SUM(ABS(${communityPoolLedgerTable.amount})), 0)::float8`,
      })
      .from(communityPoolLedgerTable)
      .where(
        sql`${communityPoolLedgerTable.entry_type} = 'adjustment'
          AND ${communityPoolLedgerTable.stripe_payment_intent_id} LIKE ${`refund:${stripePaymentIntentId}:%`}`,
      );
    const priorReversedCents = Math.round(Number(priorReversed[0]?.total ?? 0) * 100);
    const incrementalNetReversedCents = Math.max(0, desiredNetReversedCents - priorReversedCents);
    const netReversedDollars = roundMoney(incrementalNetReversedCents / 100);
    if (netReversedDollars <= 0) {
      return { reversed: false, alreadyReversed: true, netReversedDollars: 0 };
    }

    const fullyRefunded = amountRefundedCents >= chargeAmountCents;
    const [reversal] = await tx
      .insert(communityPoolLedgerTable)
      .values({
        entry_type: "adjustment",
        amount: -netReversedDollars,
        user_id: event.user_id,
        community_id: event.community_id,
        stripe_payment_intent_id: refundIdempotencyKey,
        notes: `Refund of pool contribution PI ${stripePaymentIntentId} (ratio=${ratio.toFixed(4)})`,
      })
      .onConflictDoNothing()
      .returning({ id: communityPoolLedgerTable.id });

    // A concurrent duplicate can lose the unique Stripe identity race.
    if (!reversal) {
      return { reversed: false, alreadyReversed: true, netReversedDollars: 0 };
    }

    if (fullyRefunded) {
      await tx
        .update(communityPoolFinancialEventsTable)
        .set({ settlement_status: "failed", updated_at: new Date() })
        .where(eq(communityPoolFinancialEventsTable.id, event.id));
    }

    if (event.user_id != null) {
      await tx
        .insert(transactionsTable)
        .values({
          user_id: event.user_id,
          type: "pool_contribution",
          amount: -roundMoney((event.gross_amount_cents * incrementalNetReversedCents / Math.max(event.net_amount_cents, 1)) / 100),
          description: fullyRefunded
            ? `Community Pool contribution refunded (PaymentIntent ${stripePaymentIntentId})`
            : `Partial Community Pool contribution refund (PaymentIntent ${stripePaymentIntentId})`,
          related_pool_ledger_id: event.community_pool_ledger_id,
          related_financial_event_id: event.id,
          metadata: {
            kind: "pool_contribution_refund",
            original_payment_intent_id: stripePaymentIntentId,
            refund_idempotency_key: refundIdempotencyKey,
            ratio,
            net_reversed_cents: incrementalNetReversedCents,
            settlement_status: fullyRefunded ? "failed" : event.settlement_status,
          },
          idempotency_key: `pool_contrib_refund:${refundIdempotencyKey}`,
        })
        .onConflictDoNothing();
    }

    return { reversed: true, alreadyReversed: false, netReversedDollars };
  });
}