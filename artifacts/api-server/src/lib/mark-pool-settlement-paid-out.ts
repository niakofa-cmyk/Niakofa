/**
 * Explicit operator confirmation for a Community Pool payout.
 *
 * This is the only application path allowed to write settlement_status=paid_out.
 * Stripe verification and operator payout confirmation remain separate facts.
 */
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import {
  db,
  communityPoolFinancialEventsTable,
  communityPoolFinancialAuditEventsTable,
} from "@workspace/db";
import { broadcast } from "./ws-hub";
import { getPoolBalance } from "./community-pool";
import { logger } from "./logger";

export type PoolSettlementTransitionCode =
  | "not_found"
  | "not_verified"
  | "not_available"
  | "already_paid_out"
  | "reference_required"
  | "balance_transaction_mismatch";

export class PoolSettlementTransitionError extends Error {
  constructor(message: string, public readonly code: PoolSettlementTransitionCode) {
    super(message);
    this.name = "PoolSettlementTransitionError";
  }
}

export interface MarkPoolSettlementPaidOutParams {
  financialEventId: number;
  operatorId: number;
  payoutReference: string;
  note?: string | null;
  /** Optional live Stripe check; omitted in unit tests only. */
  stripe?: Stripe | null;
}

export interface MarkPoolSettlementPaidOutResult {
  id: number;
  settlementStatus: "paid_out";
  paidOutAt: Date;
  paidOutBy: number;
  paidOutReference: string;
}

export async function markPoolSettlementPaidOut(
  params: MarkPoolSettlementPaidOutParams,
): Promise<MarkPoolSettlementPaidOutResult> {
  const payoutReference = params.payoutReference?.trim() ?? "";
  if (!payoutReference) {
    throw new PoolSettlementTransitionError(
      "A payout reference is required to mark a settlement as paid out.",
      "reference_required",
    );
  }

  // Never hold a database row lock across a Stripe network call. The locked
  // transaction below repeats every state check after this best-effort probe.
  if (params.stripe) {
    const [existing] = await db
      .select({
        balanceTransactionId: communityPoolFinancialEventsTable.stripe_balance_transaction_id,
        grossAmountCents: communityPoolFinancialEventsTable.gross_amount_cents,
        stripeFeeCents: communityPoolFinancialEventsTable.stripe_fee_cents,
        netAmountCents: communityPoolFinancialEventsTable.net_amount_cents,
        currency: communityPoolFinancialEventsTable.currency,
      })
      .from(communityPoolFinancialEventsTable)
      .where(eq(communityPoolFinancialEventsTable.id, params.financialEventId))
      .limit(1);

    if (existing?.balanceTransactionId) {
      try {
        const balanceTransaction = await params.stripe.balanceTransactions.retrieve(existing.balanceTransactionId);
        const expectedNetBeforeClimate = existing.grossAmountCents - existing.stripeFeeCents;
        if (
          balanceTransaction.status !== "available" ||
          balanceTransaction.currency !== existing.currency ||
          balanceTransaction.amount !== existing.grossAmountCents ||
          balanceTransaction.fee !== existing.stripeFeeCents ||
          balanceTransaction.net !== expectedNetBeforeClimate ||
          existing.netAmountCents < 0 ||
          existing.netAmountCents > expectedNetBeforeClimate
        ) {
          throw new PoolSettlementTransitionError(
            `Stripe Balance Transaction ${existing.balanceTransactionId} no longer matches the recorded financial event.`,
            "balance_transaction_mismatch",
          );
        }
      } catch (error) {
        if (error instanceof PoolSettlementTransitionError) throw error;
        logger.warn(
          { err: error, financial_event_id: params.financialEventId },
          "mark-paid-out: live Stripe Balance Transaction check failed",
        );
        throw new PoolSettlementTransitionError(
          "Could not re-verify the Stripe Balance Transaction before payout. Try again.",
          "balance_transaction_mismatch",
        );
      }
    }
  }

  const paidOutAt = new Date();
  const result = await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT
        id,
        stripe_verification_status,
        settlement_status,
        stripe_balance_transaction_id,
        gross_amount_cents,
        stripe_fee_cents,
        net_amount_cents,
        currency,
        user_id,
        community_pool_ledger_id
      FROM community_pool_financial_events
      WHERE id = ${params.financialEventId}
      FOR UPDATE
    `);
    const row = (locked as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    if (!row) {
      throw new PoolSettlementTransitionError(
        `No Community Pool financial event with id ${params.financialEventId}.`,
        "not_found",
      );
    }

    const verificationStatus = String(row.stripe_verification_status);
    const settlementStatus = String(row.settlement_status);
    if (settlementStatus === "paid_out") {
      throw new PoolSettlementTransitionError(
        "This settlement has already been marked paid out. Payouts cannot be repeated from this endpoint.",
        "already_paid_out",
      );
    }
    if (verificationStatus !== "verified") {
      throw new PoolSettlementTransitionError(
        "Stripe settlement has not been verified. Cannot pay out an unverified contribution.",
        "not_verified",
      );
    }
    if (settlementStatus !== "available") {
      throw new PoolSettlementTransitionError(
        "Settlement is not available for payout. Funds must reach Stripe's available status first.",
        "not_available",
      );
    }

    await tx
      .update(communityPoolFinancialEventsTable)
      .set({
        settlement_status: "paid_out",
        paid_out_at: paidOutAt,
        paid_out_by: params.operatorId,
        paid_out_reference: payoutReference,
        paid_out_note: params.note?.trim() || null,
        updated_at: paidOutAt,
      })
      .where(eq(communityPoolFinancialEventsTable.id, params.financialEventId));

    await tx.insert(communityPoolFinancialAuditEventsTable).values({
      financial_event_id: params.financialEventId,
      action: "marked_paid_out",
      actor_user_id: params.operatorId,
      reference: payoutReference,
      note: params.note?.trim() || null,
    });

    const userId = row.user_id == null ? null : Number(row.user_id);
    const ledgerId = row.community_pool_ledger_id == null ? null : Number(row.community_pool_ledger_id);
    if (userId != null && ledgerId != null) {
      await tx.execute(sql`
        UPDATE transactions
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'settlement_status', 'paid_out',
          'paid_out_at', ${paidOutAt.toISOString()},
          'paid_out_reference', ${payoutReference}
        )
        WHERE user_id = ${userId}
          AND type = 'pool_contribution'
          AND related_pool_ledger_id = ${ledgerId}
          AND COALESCE(metadata->>'kind', '') <> 'pool_contribution_refund'
      `);
    }

    return {
      id: params.financialEventId,
      settlementStatus: "paid_out" as const,
      paidOutAt,
      paidOutBy: params.operatorId,
      paidOutReference: payoutReference,
    };
  });

  try {
    broadcast({ type: "pool_updated", payload: { balance: await getPoolBalance() } });
  } catch (error) {
    // The audited payout is already committed; a websocket failure must not
    // turn a successful money operation into a false error response.
    logger.warn({ err: error, financial_event_id: params.financialEventId }, "mark-paid-out: broadcast failed");
  }

  logger.info(
    {
      financial_event_id: params.financialEventId,
      operator_id: params.operatorId,
      payout_reference: payoutReference,
    },
    "Community Pool settlement marked paid out",
  );
  return result;
}