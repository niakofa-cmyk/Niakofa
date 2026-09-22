import { describe, expect, it } from "@jest/globals";
import {
  isAmbiguousStripeError,
  isStripeTransferCapabilityError,
} from "../lib/stripe-errors";

describe("Stripe transfer error classification", () => {
  it("classifies Accounts v2 recipient capability rejection as definitive", () => {
    const error = Object.assign(new Error("recipient capability missing"), {
      type: "StripeInvalidRequestError",
      code: "insufficient_capabilities_for_transfer",
    });

    expect(isStripeTransferCapabilityError(error)).toBe(true);
    expect(isAmbiguousStripeError(error)).toBe(false);
  });

  it("does not confuse network ambiguity with destination configuration", () => {
    const error = Object.assign(new Error("connection reset"), {
      type: "StripeConnectionError",
      code: "ECONNRESET",
    });

    expect(isStripeTransferCapabilityError(error)).toBe(false);
    expect(isAmbiguousStripeError(error)).toBe(true);
  });
});