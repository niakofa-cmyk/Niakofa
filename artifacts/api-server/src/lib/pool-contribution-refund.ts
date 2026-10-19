/**
 * Reverse a Community Pool contribution when Stripe refunds the charge.
 *
 * The pool ledger stores the settled net amount, so refunds reverse net rather
 * than guessing fees. Stripe's charge.amount_refunded is cumulative; the
 * helper calculates only the newly refundable portion and is safe for repeated
 * webhook deliveries and multiple partial refunds.
 */
import { and, eq, or, sql } from "drizzle-orm";
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
  /** Stripe Charge ID; also recognizes legacy refund keys written with this ID. */
  stripeChargeId?: string;
  /** Stable Stripe refund identity for idempotency. */
  refundIdempotencyKey: string;
  /** Exact cumulative net impact from the refund Balance Transactions, if known. */
  exactNetRefundedCents?: number;
}

export async function reversePoolContributionOnRefund(
  params: ReversePoolContributionParams,
): Promise<{ reversed: boolean; alreadyReversed: boolean; netReversedDollars: number }> {
  const {
    stripePaymentIntentId,
    amountRefundedCents,
    chargeAmountCents,
    stripeChargeId,
    refundIdempotencyKey,
    exactNetRefundedCents,
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

    const [ledgerScope] = await tx
      .select({
        government_sponsor_id: communityPoolLedgerTable.government_sponsor_id,
        government_budget_id: communityPoolLedgerTable.government_budget_id,
      })
      .from(communityPoolLedgerTable)
      .where(eq(communityPoolLedgerTable.id, event.community_pool_ledger_id))
      .limit(1);
    if (ledgerScope?.government_budget_id != null && exactNetRefundedCents == null) {
      return { reversed: false, alreadyReversed: false, netReversedDollars: 0 };
    }

    const ratio = Math.min(1, amountRefundedCents / chargeAmountCents);
    const desiredNetReversedCents = exactNetRefundedCents == null
      ? Math.round(event.net_amount_cents * ratio)
      : Math.min(event.net_amount_cents, Math.max(0, Math.round(exactNetRefundedCents)));
    const priorReversed = await tx
      .select({
        total: sql<number>`COALESCE(SUM(ABS(${communityPoolLedgerTable.amount})), 0)::float8`,
      })
      .from(communityPoolLedgerTable)
      .where(
        and(
          eq(communityPoolLedgerTable.entry_type, "adjustment"),
          sql`split_part(${communityPoolLedgerTable.stripe_payment_intent_id}, ':', 1) = 'refund'`,
          or(
            sql`split_part(${communityPoolLedgerTable.stripe_payment_intent_id}, ':', 2) = ${stripePaymentIntentId}`,
            stripeChargeId
              ? sql`split_part(${communityPoolLedgerTable.stripe_payment_intent_id}, ':', 2) = ${stripeChargeId}`
              : sql`FALSE`,
          ),
        ),
      );
    const priorReversedCents = Math.round(Number(priorReversed[0]?.total ?? 0) * 100);
    const incrementalNetReversedCents = Math.max(0, desiredNetReversedCents - priorReversedCents);
    const netReversedDollars = roundMoney(incrementalNetReversedCents / 100);
    const fullyRefunded = amountRefundedCents >= chargeAmountCents;
    if (netReversedDollars <= 0) {
      if (fullyRefunded) {
        await tx
          .update(communityPoolFinancialEventsTable)
          .set({ settlement_status: "failed", updated_at: new Date() })
          .where(eq(communityPoolFinancialEventsTable.id, event.id));
      }
      return { reversed: false, alreadyReversed: true, netReversedDollars: 0 };
    }

    const [reversal] = await tx
      .insert(communityPoolLedgerTable)
      .values({
        entry_type: "adjustment",
        amount: -netReversedDollars,
        user_id: event.user_id,
        community_id: event.community_id,
        government_sponsor_id: ledgerScope?.government_sponsor_id ?? null,
        government_budget_id: ledgerScope?.government_budget_id ?? null,
        stripe_payment_intent_id: refundIdempotencyKey,
        notes: `Refund of pool contribution PI ${stripePaymentIntentId} (net_cents=${incrementalNetReversedCents})`,
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

    // Civic receipts belong to the sponsor entity, not the staff member who
    // initiated the PaymentIntent; do not create a personal wallet history row.
    if (event.user_id != null && ledgerScope?.government_budget_id == null) {
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