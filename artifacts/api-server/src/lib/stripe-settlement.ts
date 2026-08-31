import Stripe from "stripe";

export type PoolSettlementStatus = "pending" | "available" | "paid_out" | "failed";

export interface StripeSettlementBreakdown {
  stripePaymentIntentId: string;
  stripeChargeId: string;
  stripeBalanceTransactionId: string;
  grossAmountCents: number;
  stripeFeeCents: number;
  netAfterStripeFeeCents: number;
  climateContributionCents: number;
  netAmountCents: number;
  currency: string;
  settlementStatus: PoolSettlementStatus;
  availableOn: Date | null;
  stripeLivemode: boolean;
}

function asId(value: string | Stripe.Charge | Stripe.BalanceTransaction | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

/**
 * Read authoritative Stripe settlement values. Fees must come from the
 * Balance Transaction; never estimate them with 2.9% + $0.30.
 */
export async function getStripeSettlementBreakdown(
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
  options?: {
    climateContributionCents?: number;
  },
): Promise<StripeSettlementBreakdown> {
  const chargeId = asId(paymentIntent.latest_charge);
  if (!chargeId) throw new Error(`PaymentIntent ${paymentIntent.id} has no charge`);

  const charge = typeof paymentIntent.latest_charge === "object" && paymentIntent.latest_charge
    ? paymentIntent.latest_charge
    : await stripe.charges.retrieve(chargeId);
  const balanceTransactionId = asId(charge.balance_transaction);
  if (!balanceTransactionId) throw new Error(`Charge ${charge.id} has no balance transaction`);

  const balanceTransaction = await stripe.balanceTransactions.retrieve(balanceTransactionId);
  if (balanceTransaction.currency !== paymentIntent.currency) {
    throw new Error("Stripe balance transaction currency does not match PaymentIntent");
  }

  const grossAmountCents = paymentIntent.amount_received || paymentIntent.amount;
  const stripeFeeCents = balanceTransaction.fee;
  const climateContributionCents = Math.max(0, Math.round(options?.climateContributionCents ?? 0));
  const netAfterStripeFeeCents = balanceTransaction.net;
  const netAmountCents = netAfterStripeFeeCents - climateContributionCents;
  if (netAmountCents < 0) {
    throw new Error(`Settlement deductions exceed gross amount for PaymentIntent ${paymentIntent.id}`);
  }

  const settlementStatus: PoolSettlementStatus =
    balanceTransaction.status === "available" ? "available" : "pending";

  return {
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: charge.id,
    stripeBalanceTransactionId: balanceTransaction.id,
    grossAmountCents,
    stripeFeeCents,
    netAfterStripeFeeCents,
    climateContributionCents,
    netAmountCents,
    currency: balanceTransaction.currency,
    settlementStatus,
    availableOn: balanceTransaction.available_on
      ? new Date(balanceTransaction.available_on * 1000)
      : null,
    stripeLivemode: Boolean(paymentIntent.livemode),
  };
}