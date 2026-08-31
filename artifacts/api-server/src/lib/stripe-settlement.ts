import type Stripe from "stripe";

export type PoolSettlementStatus = "pending" | "available" | "paid_out" | "failed";

export interface StripeSettlementBreakdown {
  stripePaymentIntentId: string;
  stripeChargeId: string;
  stripeBalanceTransactionId: string;
  stripeClimateTransactionId: string | null;
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
    climateTransactionId?: string | null;
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
  const netAfterStripeFeeCents = balanceTransaction.net;
  if (
    !Number.isInteger(grossAmountCents) ||
    grossAmountCents <= 0 ||
    !Number.isInteger(stripeFeeCents) ||
    stripeFeeCents < 0 ||
    !Number.isInteger(netAfterStripeFeeCents) ||
    netAfterStripeFeeCents < 0
  ) {
    throw new Error(`Stripe returned invalid settlement amounts for PaymentIntent ${paymentIntent.id}`);
  }
  if (typeof balanceTransaction.amount === "number" && balanceTransaction.amount !== grossAmountCents) {
    throw new Error(`Stripe gross amount does not match the charge balance transaction for PaymentIntent ${paymentIntent.id}`);
  }
  if (grossAmountCents - stripeFeeCents !== netAfterStripeFeeCents) {
    throw new Error(`Stripe gross, fee, and net amounts do not reconcile for PaymentIntent ${paymentIntent.id}`);
  }

  const requestedClimateTransactionId = options?.climateTransactionId?.trim() || null;
  const requestedClimateContributionCents = options?.climateContributionCents ?? 0;
  if (
    !Number.isInteger(requestedClimateContributionCents) ||
    requestedClimateContributionCents < 0
  ) {
    throw new Error(`Stripe Climate contribution amount is invalid for PaymentIntent ${paymentIntent.id}`);
  }
  let climateContributionCents = requestedClimateContributionCents;
  if (requestedClimateTransactionId) {
    if (requestedClimateTransactionId === balanceTransaction.id) {
      throw new Error("Stripe Climate transaction must differ from the payment balance transaction");
    }
    const climateTransaction = await stripe.balanceTransactions.retrieve(requestedClimateTransactionId);
    if (climateTransaction.currency !== balanceTransaction.currency) {
      throw new Error("Stripe Climate balance transaction currency does not match the payment");
    }
    if (!Number.isInteger(climateTransaction.net) || climateTransaction.net >= 0) {
      throw new Error("Stripe Climate balance transaction has an invalid deduction");
    }
    const climateNetCents = Math.abs(climateTransaction.net);
    if (climateContributionCents > 0 && climateContributionCents !== climateNetCents) {
      throw new Error("Stripe Climate metadata amount does not match the balance transaction");
    }
    climateContributionCents = climateNetCents;
  }
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
    stripeClimateTransactionId: requestedClimateTransactionId,
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