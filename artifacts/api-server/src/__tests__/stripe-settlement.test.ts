import { describe, expect, it, jest } from "@jest/globals";
import { getStripeSettlementBreakdown } from "../lib/stripe-settlement";

describe("getStripeSettlementBreakdown", () => {
  it("uses Stripe Balance Transaction fee and net values without estimating", async () => {
    const stripe = {
      charges: {
        retrieve: jest.fn().mockResolvedValue({
          id: "ch_123",
          balance_transaction: "txn_123",
        }),
      },
      balanceTransactions: {
        retrieve: jest.fn().mockResolvedValue({
          id: "txn_123",
          currency: "usd",
          fee: 45,
          net: 455,
          status: "pending",
          available_on: 1_756_000_000,
        }),
      },
    } as never;

    const result = await getStripeSettlementBreakdown(stripe, {
      id: "pi_123",
      amount: 500,
      amount_received: 500,
      currency: "usd",
      latest_charge: "ch_123",
      livemode: true,
    } as never, { climateContributionCents: 5 });

    expect(result).toMatchObject({
      grossAmountCents: 500,
      stripeFeeCents: 45,
      netAfterStripeFeeCents: 455,
      climateContributionCents: 5,
      netAmountCents: 450,
      stripeBalanceTransactionId: "txn_123",
      settlementStatus: "pending",
    });
  });
});