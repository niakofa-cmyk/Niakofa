import { describe, expect, it } from "@jest/globals";
import { isPoolSettlementAccountingInvariant } from "../lib/pool-financial-integrity.js";

describe("Community Pool financial accounting invariant", () => {
  it("accepts gross minus Stripe fee minus Climate as the net amount", () => {
    expect(isPoolSettlementAccountingInvariant({
      grossAmountCents: 1000,
      stripeFeeCents: 59,
      climateContributionCents: 10,
      netAmountCents: 931,
    })).toBe(true);
  });

  it("rejects a net amount that does not reconcile to gross, fee, and Climate", () => {
    expect(isPoolSettlementAccountingInvariant({
      grossAmountCents: 1000,
      stripeFeeCents: 59,
      climateContributionCents: 10,
      netAmountCents: 932,
    })).toBe(false);
  });

  it("rejects negative deductions and negative net funds", () => {
    expect(isPoolSettlementAccountingInvariant({
      grossAmountCents: 1000,
      stripeFeeCents: -1,
      climateContributionCents: 0,
      netAmountCents: 1001,
    })).toBe(false);
    expect(isPoolSettlementAccountingInvariant({
      grossAmountCents: 100,
      stripeFeeCents: 90,
      climateContributionCents: 20,
      netAmountCents: -10,
    })).toBe(false);
  });

  it("rejects fractional cents and non-positive gross payments", () => {
    expect(isPoolSettlementAccountingInvariant({
      grossAmountCents: 1000.5,
      stripeFeeCents: 59,
      climateContributionCents: 10,
      netAmountCents: 931.5,
    })).toBe(false);
    expect(isPoolSettlementAccountingInvariant({
      grossAmountCents: 0,
      stripeFeeCents: 0,
      climateContributionCents: 0,
      netAmountCents: 0,
    })).toBe(false);
  });
});