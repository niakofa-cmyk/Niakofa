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

  it("retrieves and validates a separate negative Climate Balance Transaction", async () => {
    const retrieveBalanceTransaction = jest
      .fn()
      .mockResolvedValueOnce({
        id: "txn_123",
        amount: 500,
        currency: "usd",
        fee: 45,
        net: 455,
        status: "available",
        available_on: 1_756_000_000,
      })
      .mockResolvedValueOnce({
        id: "txn_climate",
        currency: "usd",
        fee: 0,
        net: -5,
        status: "available",
        available_on: 1_756_000_000,
      });
    const stripe = {
      charges: {
        retrieve: jest.fn().mockResolvedValue({
          id: "ch_123",
          balance_transaction: "txn_123",
        }),
      },
      balanceTransactions: { retrieve: retrieveBalanceTransaction },
    } as never;

    const result = await getStripeSettlementBreakdown(stripe, {
      id: "pi_123",
      amount: 500,
      amount_received: 500,
      currency: "usd",
      latest_charge: "ch_123",
      livemode: true,
    } as never, {
      climateContributionCents: 5,
      climateTransactionId: "txn_climate",
    });

    expect(retrieveBalanceTransaction).toHaveBeenNthCalledWith(2, "txn_climate");
    expect(result.climateContributionCents).toBe(5);
    expect(result.stripeClimateTransactionId).toBe("txn_climate");
    expect(result.netAmountCents).toBe(450);
  });

  it("rejects a Climate metadata amount that disagrees with Stripe", async () => {
    const stripe = {
      charges: {
        retrieve: jest.fn().mockResolvedValue({
          id: "ch_123",
          balance_transaction: "txn_123",
        }),
      },
      balanceTransactions: {
        retrieve: jest
          .fn()
          .mockResolvedValueOnce({
            id: "txn_123",
            amount: 500,
            currency: "usd",
            fee: 45,
            net: 455,
            status: "available",
            available_on: 1_756_000_000,
          })
          .mockResolvedValueOnce({
            id: "txn_climate",
            currency: "usd",
            fee: 0,
            net: -4,
            status: "available",
            available_on: 1_756_000_000,
          }),
      },
    } as never;

    await expect(getStripeSettlementBreakdown(stripe, {
      id: "pi_123",
      amount: 500,
      amount_received: 500,
      currency: "usd",
      latest_charge: "ch_123",
      livemode: true,
    } as never, {
      climateContributionCents: 5,
      climateTransactionId: "txn_climate",
    })).rejects.toThrow("does not match the balance transaction");
  });
});