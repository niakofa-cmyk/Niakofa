/** Municipal budget authorizations, Stripe receipts, and request reconciliation. */
import { Router } from "express";
import Stripe from "stripe";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  communityPoolFinancialEventsTable,
  governmentBudgetReceiptsTable,
  governmentBudgetsTable,
  governmentConnectedPayoutsTable,
  governmentFundingTransferLinksTable,
  governmentRequestFundingTable,
  governmentSponsorsTable,
  governmentTransferBankPayoutsTable,
  requestsTable,
  usersTable,
  communitiesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter, paymentLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { getStripeSecretKey } from "../lib/stripe-config";
import {
  getStripeRefundNetBreakdown,
  getStripeSettlementBreakdown,
} from "../lib/stripe-settlement";
import { reversePoolContributionOnRefund } from "../lib/pool-contribution-refund";

const router = Router();
const MAX_BUDGET_CENTS = 100_000_000_00; // $100,000,000.00
const MAX_PAYMENT_CENTS = 10_000_000; // $100,000.00 per Stripe receipt

type ApprovedSponsor = {
  id: number;
  entity_name: string;
  county: string;
  state: string;
  city: string | null;
};

function toCents(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents <= MAX_BUDGET_CENTS ? cents : null;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function asCents(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

async function approvedSponsorForUser(userId: number): Promise<ApprovedSponsor | null> {
  const [sponsor] = await db
    .select({
      id: governmentSponsorsTable.id,
      entity_name: governmentSponsorsTable.entity_name,
      county: governmentSponsorsTable.county,
      state: governmentSponsorsTable.state,
      city: governmentSponsorsTable.city,
    })
    .from(governmentSponsorsTable)
    .where(and(
      eq(governmentSponsorsTable.submitted_by_user_id, userId),
      eq(governmentSponsorsTable.approval_status, "approved"),
    ))
    .limit(1);
  return sponsor ?? null;
}

function requirePositiveId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function makeStripeClient(): Stripe | null {
  const key = getStripeSecretKey();
  return key ? new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion }) : null;
}

function normalizeCounty(value: string): string {
  return value.trim().replace(/\s+County$/i, "").toLocaleLowerCase();
}

async function sponsorCommunityId(sponsor: ApprovedSponsor): Promise<number | null> {
  const rows = await db
    .select({ id: communitiesTable.id, county: communitiesTable.county, state: communitiesTable.state })
    .from(communitiesTable)
    .where(eq(communitiesTable.state, sponsor.state.trim().toUpperCase()));
  return rows.find((row) =>
    row.county != null && normalizeCounty(row.county) === normalizeCounty(sponsor.county),
  )?.id ?? null;
}

async function refreshPendingReceipts(
  stripe: Stripe,
  sponsorId: number,
  budgetId?: number,
): Promise<{ updated: number; remaining: number }> {
  const pending = await db
    .select()
    .from(governmentBudgetReceiptsTable)
    .where(and(
      eq(governmentBudgetReceiptsTable.government_sponsor_id, sponsorId),
      inArray(governmentBudgetReceiptsTable.status, ["succeeded", "partially_refunded", "refunded"]),
      eq(governmentBudgetReceiptsTable.settlement_status, "pending"),
      budgetId == null ? sql`TRUE` : eq(governmentBudgetReceiptsTable.budget_id, budgetId),
    ));
  let updated = 0;
  let remaining = 0;
  for (const receipt of pending) {
    if (!receipt.stripe_payment_intent_id) continue;
    try {
      const intent = await stripe.paymentIntents.retrieve(receipt.stripe_payment_intent_id, {
        expand: ["latest_charge"],
      });
      const settlement = await getStripeSettlementBreakdown(stripe, intent);
      const refundBreakdown = await getStripeRefundNetBreakdown(stripe, settlement.stripeChargeId);
      const fullRefund = refundBreakdown.amountRefundedCents >= settlement.grossAmountCents;
      const receiptSettlementStatus = !refundBreakdown.complete
        ? "pending"
        : fullRefund
          ? "failed"
          : settlement.settlementStatus;
      if (refundBreakdown.amountRefundedCents > 0 && refundBreakdown.complete) {
        const refund = await reversePoolContributionOnRefund({
          stripePaymentIntentId: receipt.stripe_payment_intent_id,
          stripeChargeId: settlement.stripeChargeId,
          amountRefundedCents: refundBreakdown.amountRefundedCents,
          chargeAmountCents: settlement.grossAmountCents,
          refundIdempotencyKey: `refund:${receipt.stripe_payment_intent_id}:${settlement.stripeChargeId}:${refundBreakdown.amountRefundedCents}`,
          exactNetRefundedCents: refundBreakdown.netRefundedCents,
        });
        if (!refund.reversed && !refund.alreadyReversed) {
          throw new Error(`Could not reconcile the exact pool refund for receipt ${receipt.id}`);
        }
      }
      await db.transaction(async (tx) => {
        await tx
          .update(communityPoolFinancialEventsTable)
          .set({
            stripe_charge_id: settlement.stripeChargeId,
            stripe_balance_transaction_id: settlement.stripeBalanceTransactionId,
            gross_amount_cents: settlement.grossAmountCents,
            stripe_fee_cents: settlement.stripeFeeCents,
            net_amount_cents: settlement.netAmountCents,
            currency: settlement.currency,
            stripe_verification_status: "verified",
            stripe_verified_at: new Date(),
            stripe_verification_error: null,
            settlement_status: receiptSettlementStatus,
            available_on: settlement.availableOn,
            stripe_livemode: settlement.stripeLivemode,
            updated_at: new Date(),
          })
          .where(eq(
            communityPoolFinancialEventsTable.stripe_payment_intent_id,
            receipt.stripe_payment_intent_id!,
          ));
        await tx
          .update(governmentBudgetReceiptsTable)
          .set({
            stripe_fee_cents: settlement.stripeFeeCents,
            net_amount_cents: settlement.netAmountCents,
            amount_refunded_cents: Math.max(receipt.amount_refunded_cents, refundBreakdown.amountRefundedCents),
            ...(refundBreakdown.complete
              ? {
                  net_refunded_cents: Math.min(
                    settlement.netAmountCents,
                    Math.max(receipt.net_refunded_cents, refundBreakdown.netRefundedCents),
                  ),
                  refund_net_verified: true,
                }
              : {}),
            settlement_status: receiptSettlementStatus,
            status: refundBreakdown.amountRefundedCents >= settlement.grossAmountCents
              ? "refunded"
              : refundBreakdown.amountRefundedCents > 0
                ? "partially_refunded"
                : receipt.status,
            stripe_livemode: settlement.stripeLivemode,
            updated_at: new Date(),
          })
          .where(and(
            eq(governmentBudgetReceiptsTable.id, receipt.id),
            inArray(governmentBudgetReceiptsTable.status, ["succeeded", "partially_refunded", "refunded"]),
          ));
      });
      if (receiptSettlementStatus === "available") updated += 1;
      else remaining += 1;
    } catch (error) {
      remaining += 1;
      logger.warn({ error, receipt_id: receipt.id }, "civic funding: pending Stripe receipt refresh failed");
    }
  }
  return { updated, remaining };
}

router.post("/civic/funding/receipts/refresh", requireAuth, paymentLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });
  const stripe = makeStripeClient();
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured for this environment." });
  const result = await refreshPendingReceipts(stripe, sponsor.id);
  return res.json(result);
});

router.post("/civic/funding/budgets/:id/payment-intent", requireAuth, paymentLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sponsor = await approvedSponsorForUser(userId);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });
  const budgetId = requirePositiveId(req.params.id);
  const cents = toCents((req.body as { amount?: unknown })?.amount);
  if (budgetId == null) return res.status(400).json({ error: "Invalid budget id." });
  if (cents == null || cents > MAX_PAYMENT_CENTS) {
    return res.status(400).json({ error: "Receipt amount must be between $0.01 and $100,000.00." });
  }
  const stripe = makeStripeClient();
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured for this environment." });
  const communityId = await sponsorCommunityId(sponsor);
  if (communityId == null) {
    return res.status(409).json({ error: "This sponsor's county is not mapped to an active Niakofa community." });
  }
  const requestedKey = String(req.header("Idempotency-Key") ?? "").trim();
  if (!requestedKey) {
    return res.status(400).json({ error: "Idempotency-Key is required for a budget receipt attempt." });
  }
  if (requestedKey.length > 128) {
    return res.status(400).json({ error: "Idempotency-Key must be 128 characters or fewer." });
  }
  const operationKey = requestedKey;

  const receiptResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(governmentBudgetReceiptsTable)
      .where(and(
        eq(governmentBudgetReceiptsTable.government_sponsor_id, sponsor.id),
        eq(governmentBudgetReceiptsTable.operation_key, operationKey),
      ))
      .for("update")
      .limit(1);
    if (existing) {
      if (existing.budget_id !== budgetId || existing.gross_amount_cents !== cents) {
        return { ok: false as const, status: 409, error: "This payment attempt key was already used for a different amount or budget." };
      }
      if (["failed", "canceled", "refunded"].includes(existing.status)) {
        return { ok: false as const, status: 409, error: "This payment attempt is closed. Start a new attempt." };
      }
      return { ok: true as const, receipt: existing };
    }

    const [budget] = await tx
      .select()
      .from(governmentBudgetsTable)
      .where(and(
        eq(governmentBudgetsTable.id, budgetId),
        eq(governmentBudgetsTable.government_sponsor_id, sponsor.id),
      ))
      .for("update")
      .limit(1);
    if (!budget) return { ok: false as const, status: 404, error: "Budget not found." };
    if (budget.status !== "active") return { ok: false as const, status: 409, error: "This budget is closed." };

    const [reservedRow] = await tx
      .select({
        cents: sql<number>`COALESCE(SUM(
          CASE
            WHEN ${governmentBudgetReceiptsTable.status} IN ('creating', 'pending')
              THEN ${governmentBudgetReceiptsTable.gross_amount_cents}
            WHEN ${governmentBudgetReceiptsTable.status} IN ('succeeded', 'partially_refunded')
              THEN GREATEST(${governmentBudgetReceiptsTable.gross_amount_cents} - ${governmentBudgetReceiptsTable.amount_refunded_cents}, 0)
            ELSE 0
          END
        ), 0)::int`,
      })
      .from(governmentBudgetReceiptsTable)
      .where(eq(governmentBudgetReceiptsTable.budget_id, budgetId));
    const remaining = asCents(budget.authorized_amount) - Number(reservedRow?.cents ?? 0);
    if (cents > remaining) {
      return { ok: false as const, status: 409, error: `Receipt exceeds the remaining authorization of $${dollars(Math.max(remaining, 0))}.` };
    }
    const [receipt] = await tx
      .insert(governmentBudgetReceiptsTable)
      .values({
        government_sponsor_id: sponsor.id,
        budget_id: budgetId,
        created_by_user_id: userId,
        community_id: communityId,
        operation_key: operationKey,
        gross_amount_cents: cents,
        status: "creating",
      })
      .onConflictDoNothing({
        target: [
          governmentBudgetReceiptsTable.government_sponsor_id,
          governmentBudgetReceiptsTable.operation_key,
        ],
      })
      .returning();
    if (receipt) return { ok: true as const, receipt };

    const [racedReceipt] = await tx
      .select()
      .from(governmentBudgetReceiptsTable)
      .where(and(
        eq(governmentBudgetReceiptsTable.government_sponsor_id, sponsor.id),
        eq(governmentBudgetReceiptsTable.operation_key, operationKey),
      ))
      .limit(1);
    if (
      !racedReceipt ||
      racedReceipt.budget_id !== budgetId ||
      racedReceipt.gross_amount_cents !== cents
    ) {
      return { ok: false as const, status: 409, error: "This payment attempt key was used concurrently with a different receipt." };
    }
    if (["failed", "canceled", "refunded"].includes(racedReceipt.status)) {
      return { ok: false as const, status: 409, error: "This payment attempt is closed. Start a new attempt." };
    }
    return { ok: true as const, receipt: racedReceipt };
  });
  if (!receiptResult.ok) return res.status(receiptResult.status).json({ error: receiptResult.error });

  const receipt = receiptResult.receipt;
  if (receipt.status === "succeeded" || receipt.status === "partially_refunded") {
    return res.json({ receipt_id: receipt.id, status: receipt.status, client_secret: null });
  }

  try {
    const intent = receipt.stripe_payment_intent_id
      ? await stripe.paymentIntents.retrieve(receipt.stripe_payment_intent_id)
      : await stripe.paymentIntents.create({
          amount: cents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: {
            pool_contribution: "true",
            government_budget_receipt_id: String(receipt.id),
            government_sponsor_id: String(sponsor.id),
            government_budget_id: String(budgetId),
            community_id: String(communityId),
            user_id: String(userId),
          },
        }, { idempotencyKey: `gov-budget-receipt-${receipt.id}` });
    if (intent.status === "succeeded") {
      return res.json({ receipt_id: receipt.id, status: "awaiting_signed_confirmation", client_secret: null });
    }
    if (intent.status === "canceled") {
      await db
        .update(governmentBudgetReceiptsTable)
        .set({ status: "canceled", stripe_payment_intent_id: intent.id, updated_at: new Date() })
        .where(and(
          eq(governmentBudgetReceiptsTable.id, receipt.id),
          sql`${governmentBudgetReceiptsTable.status} IN ('creating', 'pending')`,
        ));
      return res.json({ receipt_id: receipt.id, status: "canceled", client_secret: null });
    }
    if (!intent.client_secret) throw new Error("Stripe did not return a client secret for this receipt.");
    await db
      .update(governmentBudgetReceiptsTable)
      .set({
        stripe_payment_intent_id: intent.id,
        status: "pending",
        updated_at: new Date(),
      })
      .where(and(
        eq(governmentBudgetReceiptsTable.id, receipt.id),
        sql`${governmentBudgetReceiptsTable.status} IN ('creating', 'pending')`,
      ));
    return res.json({ receipt_id: receipt.id, status: intent.status, client_secret: intent.client_secret });
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode != null && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      await db
        .update(governmentBudgetReceiptsTable)
        .set({ status: "failed", updated_at: new Date() })
        .where(and(
          eq(governmentBudgetReceiptsTable.id, receipt.id),
          eq(governmentBudgetReceiptsTable.status, "creating"),
        ));
    }
    logger.error({ error, receipt_id: receipt.id }, "civic funding: Stripe PaymentIntent creation failed");
    return res.status(502).json({ error: "Payment setup could not be confirmed. Retry with the same attempt key." });
  }
});

router.post("/civic/funding/receipts/:id/cancel", requireAuth, paymentLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });
  const receiptId = requirePositiveId(req.params.id);
  if (receiptId == null) return res.status(400).json({ error: "Invalid receipt id." });
  const [receipt] = await db
    .select()
    .from(governmentBudgetReceiptsTable)
    .where(and(
      eq(governmentBudgetReceiptsTable.id, receiptId),
      eq(governmentBudgetReceiptsTable.government_sponsor_id, sponsor.id),
    ))
    .limit(1);
  if (!receipt) return res.status(404).json({ error: "Receipt not found." });
  if (["succeeded", "partially_refunded", "refunded"].includes(receipt.status)) {
    return res.status(409).json({ error: "A confirmed payment cannot be canceled here." });
  }
  if (receipt.status === "canceled" || receipt.status === "failed") return res.json({ status: receipt.status });
  if (receipt.stripe_payment_intent_id) {
    const stripe = makeStripeClient();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured for this environment." });
    try {
      const intent = await stripe.paymentIntents.retrieve(receipt.stripe_payment_intent_id);
      if (intent.status === "processing") {
        return res.status(409).json({ error: "Stripe is still processing this payment; its receipt will update when confirmed." });
      }
      if (intent.status !== "canceled" && intent.status !== "succeeded") {
        await stripe.paymentIntents.cancel(intent.id);
      }
      if (intent.status === "succeeded") {
        return res.status(409).json({ error: "Stripe has confirmed this payment; refresh the funding report." });
      }
    } catch (error) {
      logger.warn({ error, receipt_id: receipt.id }, "civic funding: Stripe PaymentIntent cancellation failed");
      return res.status(502).json({ error: "Stripe could not confirm cancellation. The receipt remains reserved until its status is verified." });
    }
  }
  await db
    .update(governmentBudgetReceiptsTable)
    .set({ status: "canceled", updated_at: new Date() })
    .where(and(
      eq(governmentBudgetReceiptsTable.id, receipt.id),
      sql`${governmentBudgetReceiptsTable.status} IN ('creating', 'pending')`,
    ));
  return res.json({ status: "canceled" });
});

router.get("/civic/funding/budgets", requireAuth, generalApiLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const rows = await db
    .select({
      id: governmentBudgetsTable.id,
      name: governmentBudgetsTable.name,
      fiscal_year: governmentBudgetsTable.fiscal_year,
      appropriation_reference: governmentBudgetsTable.appropriation_reference,
      authorized_amount: governmentBudgetsTable.authorized_amount,
      status: governmentBudgetsTable.status,
      created_at: governmentBudgetsTable.created_at,
      committed_amount: sql<string>`COALESCE(SUM(${governmentRequestFundingTable.amount}), 0)::text`,
    })
    .from(governmentBudgetsTable)
    .leftJoin(
      governmentRequestFundingTable,
      and(
        eq(governmentRequestFundingTable.budget_id, governmentBudgetsTable.id),
        eq(governmentRequestFundingTable.status, "approved"),
      ),
    )
    .where(eq(governmentBudgetsTable.government_sponsor_id, sponsor.id))
    .groupBy(governmentBudgetsTable.id)
    .orderBy(desc(governmentBudgetsTable.created_at));

  const receiptRows = await db
    .select({
      budget_id: governmentBudgetReceiptsTable.budget_id,
      status: governmentBudgetReceiptsTable.status,
      settlement_status: governmentBudgetReceiptsTable.settlement_status,
      gross_amount_cents: governmentBudgetReceiptsTable.gross_amount_cents,
      amount_refunded_cents: governmentBudgetReceiptsTable.amount_refunded_cents,
      stripe_fee_cents: governmentBudgetReceiptsTable.stripe_fee_cents,
      net_amount_cents: governmentBudgetReceiptsTable.net_amount_cents,
      net_refunded_cents: governmentBudgetReceiptsTable.net_refunded_cents,
      refund_net_verified: governmentBudgetReceiptsTable.refund_net_verified,
    })
    .from(governmentBudgetReceiptsTable)
    .where(eq(governmentBudgetReceiptsTable.government_sponsor_id, sponsor.id));
  const receiptsByBudget = new Map<number, {
    gross: number; fees: number; net: number; usableNet: number; reserved: number;
  }>();
  for (const receipt of receiptRows) {
    const totals = receiptsByBudget.get(receipt.budget_id) ?? { gross: 0, fees: 0, net: 0, usableNet: 0, reserved: 0 };
    if (["creating", "pending"].includes(receipt.status)) {
      totals.reserved += receipt.gross_amount_cents;
    } else if (["succeeded", "partially_refunded"].includes(receipt.status)) {
      totals.reserved += Math.max(0, receipt.gross_amount_cents - receipt.amount_refunded_cents);
    }
    if (["succeeded", "partially_refunded", "refunded"].includes(receipt.status)) {
      totals.gross += Math.max(0, receipt.gross_amount_cents - receipt.amount_refunded_cents);
      totals.fees += receipt.stripe_fee_cents;
      const net = Math.max(0, receipt.net_amount_cents - receipt.net_refunded_cents);
      if (receipt.amount_refunded_cents === 0 || receipt.refund_net_verified) totals.net += net;
      if (
        receipt.settlement_status === "available" &&
        receipt.status !== "refunded" &&
        (receipt.amount_refunded_cents === 0 || receipt.refund_net_verified)
      ) {
        totals.usableNet += net;
      }
    }
    receiptsByBudget.set(receipt.budget_id, totals);
  }

  return res.json(rows.map((row) => {
    const authorized = asCents(row.authorized_amount);
    const committed = asCents(row.committed_amount);
    const receipts = receiptsByBudget.get(row.id) ?? { gross: 0, fees: 0, net: 0, usableNet: 0, reserved: 0 };
    return {
      ...row,
      authorized_amount: dollars(authorized),
      committed_amount: dollars(committed),
      gross_received_amount: dollars(receipts.gross),
      stripe_fee_amount: dollars(receipts.fees),
      net_received_amount: dollars(receipts.net),
      usable_received_amount: dollars(receipts.usableNet),
      available_amount: dollars(row.status === "active" ? Math.max(0, receipts.usableNet - committed) : 0),
      remaining_authorization_amount: dollars(row.status === "active" ? Math.max(0, authorized - receipts.reserved) : 0),
    };
  }));
});

router.get("/civic/funding/report", requireAuth, generalApiLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const [budgets, allocations, receiptRows, transferRows] = await Promise.all([
    db
      .select({
        id: governmentBudgetsTable.id,
        name: governmentBudgetsTable.name,
        fiscal_year: governmentBudgetsTable.fiscal_year,
        appropriation_reference: governmentBudgetsTable.appropriation_reference,
        authorized_amount: governmentBudgetsTable.authorized_amount,
        status: governmentBudgetsTable.status,
        created_at: governmentBudgetsTable.created_at,
      })
      .from(governmentBudgetsTable)
      .where(eq(governmentBudgetsTable.government_sponsor_id, sponsor.id))
      .orderBy(desc(governmentBudgetsTable.created_at)),
    db
      .select({
        id: governmentRequestFundingTable.id,
        budget_id: governmentRequestFundingTable.budget_id,
        budget_name: governmentBudgetsTable.name,
        fiscal_year: governmentBudgetsTable.fiscal_year,
        request_id: governmentRequestFundingTable.request_id,
        request_title: requestsTable.title,
        request_category: requestsTable.category,
        request_urgency: requestsTable.urgency,
        request_status: requestsTable.status,
        amount: governmentRequestFundingTable.amount,
        status: governmentRequestFundingTable.status,
        notes: governmentRequestFundingTable.notes,
        created_at: governmentRequestFundingTable.created_at,
      })
      .from(governmentRequestFundingTable)
      .innerJoin(
        governmentBudgetsTable,
        eq(governmentRequestFundingTable.budget_id, governmentBudgetsTable.id),
      )
      .innerJoin(requestsTable, eq(governmentRequestFundingTable.request_id, requestsTable.id))
      .where(eq(governmentRequestFundingTable.government_sponsor_id, sponsor.id))
      .orderBy(desc(governmentRequestFundingTable.created_at)),
    db
      .select({
        id: governmentBudgetReceiptsTable.id,
        budget_id: governmentBudgetReceiptsTable.budget_id,
        budget_name: governmentBudgetsTable.name,
        gross_amount_cents: governmentBudgetReceiptsTable.gross_amount_cents,
        stripe_fee_cents: governmentBudgetReceiptsTable.stripe_fee_cents,
        net_amount_cents: governmentBudgetReceiptsTable.net_amount_cents,
        amount_refunded_cents: governmentBudgetReceiptsTable.amount_refunded_cents,
        net_refunded_cents: governmentBudgetReceiptsTable.net_refunded_cents,
        refund_net_verified: governmentBudgetReceiptsTable.refund_net_verified,
        currency: governmentBudgetReceiptsTable.currency,
        status: governmentBudgetReceiptsTable.status,
        settlement_status: governmentBudgetReceiptsTable.settlement_status,
        stripe_payment_intent_id: governmentBudgetReceiptsTable.stripe_payment_intent_id,
        stripe_livemode: governmentBudgetReceiptsTable.stripe_livemode,
        created_at: governmentBudgetReceiptsTable.created_at,
      })
      .from(governmentBudgetReceiptsTable)
      .innerJoin(governmentBudgetsTable, eq(governmentBudgetReceiptsTable.budget_id, governmentBudgetsTable.id))
      .where(eq(governmentBudgetReceiptsTable.government_sponsor_id, sponsor.id))
      .orderBy(desc(governmentBudgetReceiptsTable.created_at)),
    db
      .select({
        funding_id: governmentRequestFundingTable.id,
        transfer_link_id: governmentFundingTransferLinksTable.id,
        stripe_transfer_id: governmentFundingTransferLinksTable.stripe_transfer_id,
        linked_amount_cents: governmentFundingTransferLinksTable.linked_amount_cents,
        reversed_amount_cents: governmentFundingTransferLinksTable.reversed_amount_cents,
        payout_link_id: governmentTransferBankPayoutsTable.id,
        balance_transaction_id: governmentTransferBankPayoutsTable.stripe_balance_transaction_id,
        bank_linked_amount_cents: governmentTransferBankPayoutsTable.linked_amount_cents,
        stripe_payout_id: governmentConnectedPayoutsTable.stripe_payout_id,
        payout_status: governmentConnectedPayoutsTable.status,
        payout_arrival_date: governmentConnectedPayoutsTable.arrival_date,
      })
      .from(governmentFundingTransferLinksTable)
      .innerJoin(
        governmentRequestFundingTable,
        eq(governmentFundingTransferLinksTable.request_funding_id, governmentRequestFundingTable.id),
      )
      .leftJoin(
        governmentTransferBankPayoutsTable,
        eq(governmentTransferBankPayoutsTable.transfer_link_id, governmentFundingTransferLinksTable.id),
      )
      .leftJoin(
        governmentConnectedPayoutsTable,
        eq(governmentTransferBankPayoutsTable.connected_payout_id, governmentConnectedPayoutsTable.id),
      )
      .where(eq(governmentRequestFundingTable.government_sponsor_id, sponsor.id)),
  ]);

  const authorized = budgets.reduce((sum, budget) => sum + asCents(budget.authorized_amount), 0);
  const committed = allocations.reduce((sum, allocation) => sum + asCents(allocation.amount), 0);
  const receiptTotals = receiptRows.reduce((totals, receipt) => {
    if (!["succeeded", "partially_refunded", "refunded"].includes(receipt.status)) return totals;
    totals.gross += Math.max(0, receipt.gross_amount_cents - receipt.amount_refunded_cents);
    totals.fees += receipt.stripe_fee_cents;
    const net = Math.max(0, receipt.net_amount_cents - receipt.net_refunded_cents);
    if (receipt.amount_refunded_cents === 0 || receipt.refund_net_verified) totals.net += net;
    if (
      receipt.settlement_status === "available" &&
      receipt.status !== "refunded" &&
      (receipt.amount_refunded_cents === 0 || receipt.refund_net_verified)
    ) {
      totals.usableNetByBudget.set(
        receipt.budget_id,
        (totals.usableNetByBudget.get(receipt.budget_id) ?? 0) + net,
      );
    }
    return totals;
  }, {
    gross: 0,
    fees: 0,
    net: 0,
    usableNetByBudget: new Map<number, number>(),
  });
  const activeBudgetIds = new Set(budgets.filter((budget) => budget.status === "active").map((budget) => budget.id));
  const activeCommitted = allocations
    .filter((allocation) => activeBudgetIds.has(allocation.budget_id))
    .reduce((sum, allocation) => sum + asCents(allocation.amount), 0);
  const activeUsableReceipts = budgets
    .filter((budget) => budget.status === "active")
    .reduce((sum, budget) => sum + (receiptTotals.usableNetByBudget.get(budget.id) ?? 0), 0);
  const activeAvailable = activeUsableReceipts - activeCommitted;
  const completedServiceValue = allocations
    .filter((allocation) => allocation.request_status === "completed")
    .reduce((sum, allocation) => sum + asCents(allocation.amount), 0);

  const reconciliationByFunding = new Map<number, {
    transfers: Map<string, number>;
    payouts: Map<string, { status: string; arrival_date: Date | null; matched_cents: number }>;
  }>();
  const seenPayoutLinks = new Set<string>();
  for (const row of transferRows) {
    const summary = reconciliationByFunding.get(row.funding_id) ?? {
      transfers: new Map<string, number>(),
      payouts: new Map<string, { status: string; arrival_date: Date | null; matched_cents: number }>(),
    };
    summary.transfers.set(
      row.stripe_transfer_id,
      Math.max(0, row.linked_amount_cents - row.reversed_amount_cents),
    );
    if (row.payout_link_id && row.stripe_payout_id && row.payout_status) {
      const pairKey = `${row.transfer_link_id}:${row.payout_link_id}`;
      if (!seenPayoutLinks.has(pairKey)) {
        seenPayoutLinks.add(pairKey);
        const payout = summary.payouts.get(row.stripe_payout_id) ?? {
          status: row.payout_status,
          arrival_date: row.payout_arrival_date,
          matched_cents: 0,
        };
        payout.matched_cents += row.bank_linked_amount_cents ?? 0;
        if (row.payout_status === "paid") payout.status = "paid";
        payout.arrival_date = row.payout_arrival_date;
        summary.payouts.set(row.stripe_payout_id, payout);
      }
    }
    reconciliationByFunding.set(row.funding_id, summary);
  }
  const allocationsWithReconciliation = allocations.map((allocation) => {
    const summary = reconciliationByFunding.get(allocation.id);
    const transferAmount = [...(summary?.transfers.values() ?? [])].reduce((sum, amount) => sum + amount, 0);
    const payouts = [...(summary?.payouts.entries() ?? [])].map(([reference, payout]) => ({
      reference: reference.slice(-8),
      status: payout.status,
      matched_amount: dollars(payout.matched_cents),
      arrival_date: payout.arrival_date,
    }));
    const bankPaidAmount = [...(summary?.payouts.values() ?? [])]
      .filter((payout) => payout.status === "paid")
      .reduce((sum, payout) => sum + payout.matched_cents, 0);
    return {
      ...allocation,
      amount: dollars(asCents(allocation.amount)),
      transfer_amount: dollars(transferAmount),
      transfer_status: transferAmount > 0
        ? "transferred"
        : summary?.transfers.size
          ? "reversed"
          : "not_transferred",
      bank_paid_amount: dollars(bankPaidAmount),
      bank_payouts: payouts,
    };
  });
  const transferAmount = allocationsWithReconciliation
    .reduce((sum, allocation) => sum + asCents(allocation.transfer_amount), 0);
  const bankPaidAmount = allocationsWithReconciliation
    .reduce((sum, allocation) => sum + asCents(allocation.bank_paid_amount), 0);

  return res.json({
    summary: {
      authorized_amount: dollars(authorized),
      committed_amount: dollars(committed),
      available_amount: dollars(Math.max(0, activeAvailable)),
      completed_service_value: dollars(completedServiceValue),
      gross_received_amount: dollars(receiptTotals.gross),
      stripe_fee_amount: dollars(receiptTotals.fees),
      net_received_amount: dollars(receiptTotals.net),
      usable_received_amount: dollars(activeUsableReceipts),
      transfer_amount: dollars(transferAmount),
      bank_paid_amount: dollars(bankPaidAmount),
    },
    receipts: receiptRows.map((receipt) => ({
      ...receipt,
      gross_amount: dollars(receipt.gross_amount_cents),
      refunded_amount: dollars(receipt.amount_refunded_cents),
      stripe_fee_amount: dollars(receipt.stripe_fee_cents),
      net_amount: dollars(receipt.net_amount_cents),
      net_refunded_amount: dollars(receipt.net_refunded_cents),
      net_after_refunds:
        receipt.amount_refunded_cents === 0 || receipt.refund_net_verified
          ? dollars(Math.max(0, receipt.net_amount_cents - receipt.net_refunded_cents))
          : null,
    })),
    allocations: allocationsWithReconciliation,
  });
});

router.post("/civic/funding/budgets", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sponsor = await approvedSponsorForUser(userId);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const body = req.body as {
    name?: unknown;
    fiscal_year?: unknown;
    appropriation_reference?: unknown;
    authorized_amount?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const fiscalYearInput = typeof body.fiscal_year === "string" ? body.fiscal_year.trim() : "";
  const reference = typeof body.appropriation_reference === "string" ? body.appropriation_reference.trim() : "";
  const cents = toCents(body.authorized_amount);

  if (!name || name.length > 120) return res.status(400).json({ error: "Budget name is required and must be 120 characters or fewer." });
  const fiscalYearMatch = fiscalYearInput.match(/^(?:FY\s*)?(\d{4}(?:-\d{2})?)$/i);
  if (!fiscalYearMatch) return res.status(400).json({ error: "Fiscal year must be a year such as 2026 or FY 2026-27." });
  const fiscalYear = `FY ${fiscalYearMatch[1]}`;
  if (!reference || reference.length > 120) return res.status(400).json({ error: "Appropriation reference is required and must be 120 characters or fewer." });
  if (cents == null) return res.status(400).json({ error: "Authorized amount must be a positive amount with no more than two decimal places (up to $100,000,000)." });

  try {
    const [created] = await db
      .insert(governmentBudgetsTable)
      .values({
        government_sponsor_id: sponsor.id,
        name,
        fiscal_year: fiscalYear,
        appropriation_reference: reference,
        authorized_amount: dollars(cents),
        created_by_user_id: userId,
      })
      .returning();
    logger.info({ sponsor_id: sponsor.id, budget_id: created.id, fiscal_year: fiscalYear }, "civic funding: budget authorization recorded");
    return res.status(201).json({
      ...created,
      committed_amount: "0.00",
      available_amount: "0.00",
      gross_received_amount: "0.00",
      stripe_fee_amount: "0.00",
      net_received_amount: "0.00",
      usable_received_amount: "0.00",
      remaining_authorization_amount: dollars(cents),
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return res.status(409).json({ error: "That appropriation reference is already registered for this fiscal year." });
    }
    throw err;
  }
});

router.patch("/civic/funding/budgets/:id/close", requireAuth, generalApiLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });
  const budgetId = requirePositiveId(req.params.id);
  if (budgetId == null) return res.status(400).json({ error: "Invalid budget id." });

  const [closed] = await db
    .update(governmentBudgetsTable)
    .set({ status: "closed", updated_at: new Date() })
    .where(and(
      eq(governmentBudgetsTable.id, budgetId),
      eq(governmentBudgetsTable.government_sponsor_id, sponsor.id),
      eq(governmentBudgetsTable.status, "active"),
    ))
    .returning();
  if (!closed) return res.status(409).json({ error: "Budget not found or already closed." });
  return res.json(closed);
});

router.post("/civic/funding/allocations", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sponsor = await approvedSponsorForUser(userId);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const body = req.body as { budget_id?: unknown; request_id?: unknown; amount?: unknown; notes?: unknown };
  const budgetId = requirePositiveId(body.budget_id);
  const requestId = requirePositiveId(body.request_id);
  const cents = toCents(body.amount);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (budgetId == null || requestId == null) return res.status(400).json({ error: "Valid budget_id and request_id are required." });
  if (cents == null) return res.status(400).json({ error: "Allocation amount must be positive and have no more than two decimal places." });
  if (notes.length > 1000) return res.status(400).json({ error: "Notes must be 1,000 characters or fewer." });

  const [target] = await db
    .select({
      id: requestsTable.id,
      status: requestsTable.status,
      requester_id: requestsTable.requester_id,
      title: requestsTable.title,
      category: requestsTable.category,
      urgency: requestsTable.urgency,
    })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);
  if (!target) return res.status(404).json({ error: "Community request not found." });
  if (target.status !== "open" && target.status !== "claimed") {
    return res.status(409).json({ error: "Only open or claimed community requests can receive a new public funding approval." });
  }

  const [requester] = await db
    .select({ county: communitiesTable.county, state: communitiesTable.state, city: usersTable.city })
    .from(usersTable)
    .innerJoin(communitiesTable, eq(usersTable.community_id, communitiesTable.id))
    .where(eq(usersTable.id, target.requester_id))
    .limit(1);
  const normalize = (value: string) => value.trim().replace(/\s+County$/i, "").toLocaleLowerCase();
  if (
    !requester
    || !requester.county
    || !requester.state
    || normalize(requester.county) !== normalize(sponsor.county)
    || requester.state.trim().toUpperCase() !== sponsor.state.trim().toUpperCase()
    || (sponsor.city != null && requester.city?.trim().toLocaleLowerCase() !== sponsor.city.trim().toLocaleLowerCase())
  ) {
    return res.status(404).json({ error: "Community request not found in your approved jurisdiction." });
  }

  const stripe = makeStripeClient();
  if (stripe) await refreshPendingReceipts(stripe, sponsor.id, budgetId);

  try {
    const allocation = await db.transaction(async (tx) => {
      const [budget] = await tx
        .select({
          id: governmentBudgetsTable.id,
          name: governmentBudgetsTable.name,
          fiscal_year: governmentBudgetsTable.fiscal_year,
          authorized_amount: governmentBudgetsTable.authorized_amount,
          status: governmentBudgetsTable.status,
        })
        .from(governmentBudgetsTable)
        .where(and(
          eq(governmentBudgetsTable.id, budgetId),
          eq(governmentBudgetsTable.government_sponsor_id, sponsor.id),
        ))
        .for("update")
        .limit(1);
      if (!budget) return { ok: false as const, error: "Budget not found.", status: 404 as const };
      if (budget.status !== "active") return { ok: false as const, error: "This budget is closed.", status: 409 as const };

      const [lockedRequest] = await tx
        .select({
          id: requestsTable.id,
          title: requestsTable.title,
          category: requestsTable.category,
          urgency: requestsTable.urgency,
          status: requestsTable.status,
        })
        .from(requestsTable)
        .where(eq(requestsTable.id, requestId))
        .for("update")
        .limit(1);
      if (!lockedRequest) return { ok: false as const, error: "Community request not found.", status: 404 as const };
      if (lockedRequest.status !== "open" && lockedRequest.status !== "claimed") {
        return { ok: false as const, error: "Only open or claimed community requests can receive a new public funding approval.", status: 409 as const };
      }

      const [committedRow] = await tx
        .select({
          cents: sql<number>`COALESCE(ROUND(SUM(${governmentRequestFundingTable.amount}) * 100), 0)::int`,
        })
        .from(governmentRequestFundingTable)
        .where(and(
          eq(governmentRequestFundingTable.budget_id, budget.id),
          eq(governmentRequestFundingTable.status, "approved"),
        ));
      const [usableReceiptRow] = await tx
        .select({
          cents: sql<number>`COALESCE(SUM(GREATEST(
            ${governmentBudgetReceiptsTable.net_amount_cents} - ${governmentBudgetReceiptsTable.net_refunded_cents},
            0
          )), 0)::int`,
        })
        .from(governmentBudgetReceiptsTable)
        .where(and(
          eq(governmentBudgetReceiptsTable.budget_id, budget.id),
          eq(governmentBudgetReceiptsTable.settlement_status, "available"),
          inArray(governmentBudgetReceiptsTable.status, ["succeeded", "partially_refunded"]),
          sql`(
            ${governmentBudgetReceiptsTable.amount_refunded_cents} = 0
            OR ${governmentBudgetReceiptsTable.refund_net_verified} = TRUE
          )`,
        ));
      const cashBackedLimit = Math.min(asCents(budget.authorized_amount), Number(usableReceiptRow?.cents ?? 0));
      const remaining = cashBackedLimit - Number(committedRow?.cents ?? 0);
      if (cents > remaining) {
        return {
          ok: false as const,
          error: `Allocation exceeds confirmed, available receipts. Remaining cash-backed amount: $${dollars(Math.max(remaining, 0))}.`,
          status: 409 as const,
        };
      }

      const [created] = await tx
        .insert(governmentRequestFundingTable)
        .values({
          government_sponsor_id: sponsor.id,
          budget_id: budget.id,
          request_id: lockedRequest.id,
          amount: dollars(cents),
          notes: notes || null,
          approved_by_user_id: userId,
        })
        .returning();
      return {
        ok: true as const,
        allocation: {
          ...created,
          budget_name: budget.name,
          fiscal_year: budget.fiscal_year,
          request_title: lockedRequest.title,
          request_category: lockedRequest.category,
          request_urgency: lockedRequest.urgency,
          request_status: lockedRequest.status,
          amount: dollars(cents),
        },
      };
    });
    if (!allocation.ok) return res.status(allocation.status).json({ error: allocation.error });

    logger.info({
      sponsor_id: sponsor.id,
      budget_id: budgetId,
      request_id: requestId,
      amount: dollars(cents),
      approved_by: userId,
    }, "civic funding: public budget commitment approved for community request");
    return res.status(201).json(allocation.allocation);
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return res.status(409).json({ error: "This sponsor already has a public funding approval for that request." });
    }
    throw err;
  }
});

export default router;
