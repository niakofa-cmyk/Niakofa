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
    request_title,
  } = data;
  const stripeKey = getStripeSecretKey();
  if (!stripeClient && !stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const stripe = stripeClient ?? new Stripe(stripeKey!);
  const payoutCents = amount_cents - platform_fee_cents;
  const operationKey = `payout-${request_id}-${helper_id}`;
  const transferGroup = `niakofa-request-${request_id}`;

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
        helper_id: payoutOperationsTable.helper_id,
        stripe_transfer_id: payoutOperationsTable.stripe_transfer_id,
      });
    if (created) return created;

    const [existing] = await tx
      .select({
        id: payoutOperationsTable.id,
        state: payoutOperationsTable.state,
        helper_id: payoutOperationsTable.helper_id,
        stripe_transfer_id: payoutOperationsTable.stripe_transfer_id,
      })
      .from(payoutOperationsTable)
      .where(eq(payoutOperationsTable.operation_key, operationKey))
      .limit(1);
    if (!existing || existing.helper_id !== helper_id) {
      throw new Error("payout operation identity conflict requires reconciliation");
    }
    return existing;
  });

  let transfer: Stripe.Transfer;
  if (operation.state === "completed" && operation.stripe_transfer_id) {
    transfer = await stripe.transfers.retrieve(operation.stripe_transfer_id);
  } else {
    const candidates = await stripe.transfers.list({
      transfer_group: transferGroup,
      limit: 100,
    });
    const reconciled = candidates.data.find((candidate) =>
      candidate.destination === stripe_account_id &&
      candidate.metadata.request_id === String(request_id) &&
      candidate.metadata.helper_id === String(helper_id));

    transfer = reconciled ?? await stripe.transfers.create({
      amount: payoutCents,
      currency: "usd",
      destination: stripe_account_id,
      transfer_group: transferGroup,
      description: `Niakofa — Pay It Forward: ${request_title}`,
      metadata: {
        request_id: String(request_id),
        helper_id: String(helper_id),
        operation_key: operationKey,
        platform_fee_cents: String(platform_fee_cents),
        attempt: String(attempt),
      },
    }, {
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
        notes: `Payout reconciled (attempt ${attempt}). Platform fee: $${(platform_fee_cents / 100).toFixed(2)}`,
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
        user_id: helper_id,
        request_id,
        type: "payout_sent",
        amount: payoutCents / 100,
        description: request_title,
        idempotency_key: operationKey,
      })
      .onConflictDoNothing();
  });

  broadcast({
    type: "payout_sent",
    payload: {
      request_id,
      helper_id,
      amount: payoutCents / 100,
      transfer_id: transfer.id,
      retried: attempt > 1,
    },
  });
  return transfer;
}