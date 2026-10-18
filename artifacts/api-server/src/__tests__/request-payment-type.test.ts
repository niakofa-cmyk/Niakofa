import { describe, expect, it } from "@jest/globals";
import { DEFAULT_REQUEST_PAYMENT_TYPE, resolveRequestPaymentType } from "../lib/request-payment-type.js";

describe("request payment choice", () => {
  it("does not default an unspecified request to a Pay It Forward pledge", () => {
    expect(DEFAULT_REQUEST_PAYMENT_TYPE).toBe("goodwill");
    expect(resolveRequestPaymentType(undefined)).toBe("goodwill");
    expect(resolveRequestPaymentType(null)).toBe("goodwill");
  });

  it("preserves an explicitly selected Pay It Forward option", () => {
    expect(resolveRequestPaymentType("pay_it_forward")).toBe("pay_it_forward");
  });
});
