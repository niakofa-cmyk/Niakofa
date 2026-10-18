import { describe, it } from "node:test";
import { expect } from "expect";
import { clampRepaymentAmount, getRepaymentMaxAmount } from "../repayment-amount";

describe("clampRepaymentAmount", () => {
  it("caps a selected amount at the outstanding balance", () => {
    expect(clampRepaymentAmount(50, 20)).toBe(20);
  });

  it("keeps partial repayments at cent precision", () => {
    expect(clampRepaymentAmount(4.25, 20)).toBe(4.25);
  });

  it("never rounds above a fractional-cent outstanding balance", () => {
    expect(clampRepaymentAmount(10, 1.239)).toBe(1.23);
  });

  it("preserves exact-cent balances despite floating-point representation", () => {
    expect(getRepaymentMaxAmount(10.29)).toBe(10.29);
    expect(clampRepaymentAmount(20, 10.29)).toBe(10.29);
  });

  it("returns zero for invalid or resolved balances", () => {
    expect(clampRepaymentAmount(Number.NaN, 10)).toBe(0);
    expect(clampRepaymentAmount(10, 0)).toBe(0);
    expect(clampRepaymentAmount(-1, 10)).toBe(0);
  });
});
