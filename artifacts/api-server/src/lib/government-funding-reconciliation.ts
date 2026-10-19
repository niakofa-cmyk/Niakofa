import type Stripe from "stripe";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  governmentConnectedPayoutsTable,
  governmentFundingTransferLinksTable,
  governmentRequestFundingTable,
  governmentTransferBankPayoutsTable,
  payoutOperationsTable,
} from "@workspace/db";
import { logger } from "./logger";

function objectId(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function toCents(value: string | number): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/**
 * Attach an already-created helper transfer to public commitments for the
 * same request. This is attribution only: it never creates a Stripe transfer.
 */
export async function recordGovernmentFundingTransfer(transfer: Stripe.Transfer): Promise<void> {
  const operationKey = transfer.metadata?.operation_key?.trim();
  if (!operationKey) return;

  await db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(payoutOperationsTable)
      .where(eq(payoutOperationsTable.operation_key, operationKey))
      .for("update")
      .limit(1);
    if (!operation) return;

    const destination = objectId(transfer.destination);
    const expectedTransferCents = operation.amount_cents - operation.platform_fee_cents;
    if (
      transfer.id === "" ||
      (operation.stripe_transfer_id != null && operation.stripe_transfer_id !== transfer.id) ||
      transfer.amount !== expectedTransferCents ||
      transfer.currency !== "usd" ||
      destination !== operation.stripe_account_id ||
      transfer.metadata?.request_id !== String(operation.request_id) ||
      transfer.metadata?.helper_id !== String(operation.helper_id)
    ) {
      logger.warn(
        { transfer_id: transfer.id, operation_key: operationKey, request_id: operation.request_id },
        "Government funding transfer link rejected because the Stripe transfer does not match its payout operation",
      );
      return;
    }

    const allocations = await tx
      .select({
        id: governmentRequestFundingTable.id,
        amount: governmentRequestFundingTable.amount,
      })
      .from(governmentRequestFundingTable)
      .where(and(
        eq(governmentRequestFundingTable.request_id, operation.request_id),
        eq(governmentRequestFundingTable.status, "approved"),
      ))
      .orderBy(asc(governmentRequestFundingTable.created_at), asc(governmentRequestFundingTable.id))
      .for("update");
    if (allocations.length === 0) return;

    const allocationIds = allocations.map((allocation) => allocation.id);
    const existingLinks = await tx
      .select()
      .from(governmentFundingTransferLinksTable)
      .where(inArray(governmentFundingTransferLinksTable.request_funding_id, allocationIds));
    if (existingLinks.some((link) => link.stripe_transfer_id === transfer.id)) return;

    const alreadyAttributed = new Map<number, number>();
    for (const link of existingLinks) {
      const amount = Math.max(0, link.linked_amount_cents - link.reversed_amount_cents);
      alreadyAttributed.set(
        link.request_funding_id,
        (alreadyAttributed.get(link.request_funding_id) ?? 0) + amount,
      );
    }

    const destinationPaymentId = objectId(transfer.destination_payment);
    let remaining = transfer.amount;
    for (const allocation of allocations) {
      if (remaining <= 0) break;
      const commitmentCents = toCents(allocation.amount);
      const unlinked = Math.max(0, commitmentCents - (alreadyAttributed.get(allocation.id) ?? 0));
      const linkedAmount = Math.min(unlinked, remaining);
      if (linkedAmount <= 0) continue;

      await tx.insert(governmentFundingTransferLinksTable).values({
        request_funding_id: allocation.id,
        payout_operation_id: operation.id,
        stripe_transfer_id: transfer.id,
        stripe_destination_payment_id: destinationPaymentId,
        stripe_account_id: destination!,
        linked_amount_cents: linkedAmount,
        transfer_amount_cents: transfer.amount,
        reversed_amount_cents: 0,
        stripe_livemode: transfer.livemode,
      }).onConflictDoNothing();
      remaining -= linkedAmount;
    }
  });
}

/** Update linked amounts from Stripe's cumulative transfer-reversal value. */
export async function recordGovernmentFundingTransferReversal(transfer: Stripe.Transfer): Promise<void> {
  if (!transfer.id || transfer.amount <= 0 || transfer.amount_reversed < 0) return;
  const links = await db
    .select()
    .from(governmentFundingTransferLinksTable)
    .where(eq(governmentFundingTransferLinksTable.stripe_transfer_id, transfer.id));
  for (const link of links) {
    const attributedReversal = Math.min(
      link.linked_amount_cents,
      Math.round(link.linked_amount_cents * Math.min(transfer.amount_reversed, transfer.amount) / transfer.amount),
    );
    await db
      .update(governmentFundingTransferLinksTable)
      .set({
        reversed_amount_cents: sql`GREATEST(${governmentFundingTransferLinksTable.reversed_amount_cents}, ${attributedReversal})`,
      })
      .where(eq(governmentFundingTransferLinksTable.id, link.id));
  }
}

/**
 * Store a connected-account payout and only attach it to a request when the
 * payout's own balance-transaction source identifies that request's transfer.
 */
export async function recordGovernmentConnectedPayout(
  stripe: Stripe,
  eventId: string,
  livemode: boolean,
  accountId: string | null,
  payout: Stripe.Payout,
): Promise<void> {
  if (!accountId || !["paid", "failed", "canceled"].includes(payout.status)) return;
  const links = await db
    .select()
    .from(governmentFundingTransferLinksTable)
    .where(eq(governmentFundingTransferLinksTable.stripe_account_id, accountId));
  if (links.length === 0) return;

  const balanceTransactions: Stripe.BalanceTransaction[] = [];
  let startingAfter: string | undefined;
  while (true) {
    const page = await stripe.balanceTransactions.list(
      { payout: payout.id, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      { stripeAccount: accountId },
    );
    balanceTransactions.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]!.id;
  }

  await db.transaction(async (tx) => {
    const [savedPayout] = await tx
      .insert(governmentConnectedPayoutsTable)
      .values({
        stripe_account_id: accountId,
        stripe_payout_id: payout.id,
        amount_cents: payout.amount,
        currency: payout.currency,
        status: payout.status as "paid" | "failed" | "canceled",
        arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
        stripe_event_id: eventId,
        stripe_livemode: livemode,
      })
      .onConflictDoUpdate({
        target: [
          governmentConnectedPayoutsTable.stripe_account_id,
          governmentConnectedPayoutsTable.stripe_payout_id,
        ],
        set: {
          amount_cents: payout.amount,
          currency: payout.currency,
          status: payout.status,
          arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
          stripe_event_id: eventId,
          stripe_livemode: livemode,
          updated_at: new Date(),
        },
      })
      .returning({ id: governmentConnectedPayoutsTable.id });
    if (!savedPayout) throw new Error(`Could not save connected payout ${payout.id}`);

    const matchingLinks = links.filter((link) =>
      balanceTransactions.some((balanceTransaction) => {
        const sourceId = objectId(balanceTransaction.source as string | { id: string } | null);
        return sourceId === link.stripe_transfer_id || sourceId === link.stripe_destination_payment_id;
      }),
    );
    const priorPayoutMappings = matchingLinks.length === 0
      ? []
      : await tx
          .select({
            transfer_link_id: governmentTransferBankPayoutsTable.transfer_link_id,
            connected_payout_id: governmentTransferBankPayoutsTable.connected_payout_id,
            linked_amount_cents: governmentTransferBankPayoutsTable.linked_amount_cents,
            status: governmentConnectedPayoutsTable.status,
          })
          .from(governmentTransferBankPayoutsTable)
          .innerJoin(
            governmentConnectedPayoutsTable,
            eq(
              governmentTransferBankPayoutsTable.connected_payout_id,
              governmentConnectedPayoutsTable.id,
            ),
          )
          .where(inArray(
            governmentTransferBankPayoutsTable.transfer_link_id,
            matchingLinks.map((link) => link.id),
          ));
    const currentPayoutLinkIds = new Set(
      priorPayoutMappings
        .filter((mapping) => mapping.connected_payout_id === savedPayout.id)
        .map((mapping) => mapping.transfer_link_id),
    );
    const previouslyPaidByLink = new Map<number, number>();
    for (const mapping of priorPayoutMappings) {
      if (mapping.status !== "paid" || mapping.connected_payout_id === savedPayout.id) continue;
      previouslyPaidByLink.set(
        mapping.transfer_link_id,
        (previouslyPaidByLink.get(mapping.transfer_link_id) ?? 0) + mapping.linked_amount_cents,
      );
    }

    for (const balanceTransaction of balanceTransactions) {
      if (balanceTransaction.amount <= 0) continue;
      const sourceId = objectId(balanceTransaction.source as string | { id: string } | null);
      if (!sourceId) continue;
      const matching = links.filter(
        (link) =>
          link.stripe_transfer_id === sourceId ||
          link.stripe_destination_payment_id === sourceId,
      );
      let remainingTransactionCents = balanceTransaction.amount;
      for (const link of matching) {
        if (currentPayoutLinkIds.has(link.id) || remainingTransactionCents <= 0) continue;
        const stillLinked = Math.max(
          0,
          link.linked_amount_cents -
            link.reversed_amount_cents -
            (previouslyPaidByLink.get(link.id) ?? 0),
        );
        const mappedAmount = Math.min(stillLinked, remainingTransactionCents);
        if (mappedAmount <= 0) continue;
        await tx.insert(governmentTransferBankPayoutsTable).values({
          transfer_link_id: link.id,
          connected_payout_id: savedPayout.id,
          stripe_balance_transaction_id: balanceTransaction.id,
          linked_amount_cents: mappedAmount,
        }).onConflictDoNothing();
        remainingTransactionCents -= mappedAmount;
      }
    }
  });
}
