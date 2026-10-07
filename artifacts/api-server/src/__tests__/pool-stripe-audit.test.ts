import { describe, expect, it } from "@jest/globals";
import { findMissingPoolPaymentIntentRecords } from "../lib/pool-stripe-audit.js";

const poolPayment = (overrides: Record<string, unknown> = {}) => ({
  id: "pi_pool_1",
  status: "succeeded",
  amount: 500,
  amount_received: 500,
  currency: "usd",
  livemode: true,
  created: 1_700_000_000,
  description: "Pool contribution",
  metadata: { pool_contribution: "true", user_id: "42", community_id: "7" },
  ...overrides,
});

describe("findMissingPoolPaymentIntentRecords", () => {
  it("ignores non-pool payments and pool payments that have not succeeded", () => {
    const result = findMissingPoolPaymentIntentRecords(
      [
        poolPayment({ id: "pi_unrelated", metadata: {} }),
        poolPayment({ id: "pi_pending", status: "processing" }),
      ],
      [],
    );

    expect(result).toEqual([]);
  });

  it("reports missing ledger and financial event records for successful pool payments", () => {
    const [result] = findMissingPoolPaymentIntentRecords([poolPayment()], []);

    expect(result).toMatchObject({
      payment_intent_id: "pi_pool_1",
      amount: 5,
      user_id: 42,
      community_id: 7,
      missing_ledger: true,
      missing_financial_event: true,
      duplicate_ledger_count: 0,
    });
  });

  it("reports a missing financial event without treating non-Stripe grants as Stripe payments", () => {
    const result = findMissingPoolPaymentIntentRecords(
      [poolPayment()],
      [{ paymentIntentId: "pi_pool_1", ledgerId: 12, financialEventId: null }],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      missing_ledger: false,
      missing_financial_event: true,
    });
  });

  it("flags duplicate ledger links as a separate reconciliation issue", () => {
    const result = findMissingPoolPaymentIntentRecords(
      [poolPayment()],
      [
        { paymentIntentId: "pi_pool_1", ledgerId: 12, financialEventId: 20 },
        { paymentIntentId: "pi_pool_1", ledgerId: 13, financialEventId: 21 },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      missing_ledger: false,
      missing_financial_event: false,
      duplicate_ledger_count: 1,
    });
  });
});
