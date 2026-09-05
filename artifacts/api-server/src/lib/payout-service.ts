import Stripe from "stripe";
import { db, payoutOperationsTable, transactionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { PayoutJobData } from "./queue";
import { broadcast } from "./ws-hub";
import { getStripeSecretKey } from "./stripe-config";

export async function executeHelperPayout(
  data: PayoutJobData,
  attempt: number,
  stripeClient?: Stripe,
): Promise<Stripe.Transfer> {
  const {
    request_id, helper_id, requester_id,
    amount_cents, platform_fee_cents, stripe_account_id,
    request_title: _request_title,
  } = data;
  const stripeKey = getStripeSecretKey();
  if (!stripeClient && !stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const stripe = stripeClient ?? new Stripe(stripeKey!);
  const operationKey = `payout-${request_id}-${helper_id}`;

  const operation = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(payoutOperationsTable)
      .values({
        operation_key: operationKey,
        request_id,
        helper_id,
        requester_id,
        amount_cents,
        platform_fee_cents,
        stripe_account_id,
        state: "claimed",
        last_attempt: attempt,
        notes: "Payout operation claimed; awaiting Stripe reconciliation.",
      })
      .onConflictDoNothing()
      .returning({
        id: payoutOperationsTable.id,
        state: payoutOperationsTable.state,
        request_id: payoutOperationsTable.request_id,
        helper_id: payoutOperationsTable.helper_id,
        requester_id: payoutOperationsTable.requester_id,
        amount_cents: payoutOperationsTable.amount_cents,
        platform_fee_cents: payoutOperationsTable.platform_fee_cents,
        stripe_account_id: payoutOperationsTable.stripe_account_id,
        stripe_transfer_id: payoutOperationsTable.stripe_transfer_id,
      });
    if (created) return created;

    const [existing] = await tx
      .select({
        id: payoutOperationsTable.id,
        state: payoutOperationsTable.state,
        request_id: payoutOperationsTable.request_id,
        helper_id: payoutOperationsTable.helper_id,
        requester_id: payoutOperationsTable.requester_id,
        amount_cents: payoutOperationsTable.amount_cents,
        platform_fee_cents: payoutOperationsTable.platform_fee_cents,
        stripe_account_id: payoutOperationsTable.stripe_account_id,
        stripe_transfer_id: payoutOperationsTable.stripe_transfer_id,
      })
      .from(payoutOperationsTable)
      .where(eq(payoutOperationsTable.operation_key, operationKey))
      .limit(1);
    if (
      !existing ||
      existing.request_id !== request_id ||
      existing.helper_id !== helper_id ||
      existing.requester_id !== requester_id ||
      existing.amount_cents !== amount_cents ||
      existing.platform_fee_cents !== platform_fee_cents ||
      existing.stripe_account_id !== stripe_account_id
    ) {
      throw new Error("payout operation identity conflict requires reconciliation");
    }
    return existing;
  });

  const transferGroup = `niakofa-request-${operation.request_id}`;
  const operationPayoutCents = operation.amount_cents - operation.platform_fee_cents;
  // Build exclusively from the durable operation, rather than retry job
  // fields. Stripe associates an idempotency key with the complete request
  // payload; this keeps the key's parameters byte-for-byte logical equals
  // even if a retried job has stale or changed display data.
  const transferParams: Stripe.TransferCreateParams = {
    amount: operationPayoutCents,
    currency: "usd",
    destination: operation.stripe_account_id,
    transfer_group: transferGroup,
    description: "Niakofa — Pay It Forward payout",
    metadata: {
      request_id: String(operation.request_id),
      helper_id: String(operation.helper_id),
      operation_key: operationKey,
      platform_fee_cents: String(operation.platform_fee_cents),
    },
  };

  let transfer: Stripe.Transfer;
  if (operation.state === "completed" && operation.stripe_transfer_id) {
    transfer = await stripe.transfers.retrieve(operation.stripe_transfer_id);
  } else {
    const candidates = await stripe.transfers.list({
      transfer_group: transferGroup,
      limit: 100,
    });
    const exactMatches = candidates.data.filter((candidate) =>
      candidate.destination === operation.stripe_account_id &&
      candidate.amount === operationPayoutCents &&
      candidate.currency === "usd" &&
      candidate.metadata.request_id === String(operation.request_id) &&
      candidate.metadata.helper_id === String(operation.helper_id) &&
      candidate.metadata.operation_key === operationKey &&
      candidate.metadata.platform_fee_cents === String(operation.platform_fee_cents));
    if (exactMatches.length > 1) {
      throw new Error("multiple exact Stripe transfers require payout reconciliation");
    }

    transfer = exactMatches[0] ?? await stripe.transfers.create(transferParams, {
      idempotencyKey: operationKey,
    });
  }

  await db.transaction(async (tx) => {
    const [completed] = await tx
      .update(payoutOperationsTable)
      .set({
        state: "completed",
        stripe_transfer_id: transfer.id,
        last_attempt: attempt,
        notes: `Payout reconciled (attempt ${attempt}). Platform fee: $${(operation.platform_fee_cents / 100).toFixed(2)}`,
        updated_at: new Date(),
      })
      .where(and(
        eq(payoutOperationsTable.id, operation.id),
        eq(payoutOperationsTable.operation_key, operationKey),
      ))
      .returning({ id: payoutOperationsTable.id });
    if (!completed) {
      throw new Error("payout operation disappeared during reconciliation");
    }

    await tx
      .insert(transactionsTable)
      .values({
        user_id: operation.helper_id,
        request_id: operation.request_id,
        type: "payout_sent",
        amount: operationPayoutCents / 100,
        description: "Niakofa — Pay It Forward payout",
        idempotency_key: operationKey,
      })
      .onConflictDoNothing();
  });

  broadcast({
    type: "payout_sent",
    payload: {
      request_id: operation.request_id,
      helper_id: operation.helper_id,
      amount: operationPayoutCents / 100,
      transfer_id: transfer.id,
      retried: attempt > 1,
    },
  });
  return transfer;
}