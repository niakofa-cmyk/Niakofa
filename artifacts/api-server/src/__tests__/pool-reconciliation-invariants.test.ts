import { describe, expect, it } from "@jest/globals";
import { reconcileSpendablePool } from "../lib/pool-reconciliation-invariants.js";

describe("reconcileSpendablePool", () => {
  it("allows only the documented one-cent rounding allowance", () => {
    expect(
      reconcileSpendablePool({
        stripeAvailableCents: 455,
        ledgerSpendableCents: 456,
      }),
    ).toMatchObject({ driftCents: 1, ok: true });

    expect(
      reconcileSpendablePool({
        stripeAvailableCents: 455,
        ledgerSpendableCents: 910,
      }),
    ).toMatchObject({ driftCents: 455, ok: false });
  });

  it("rejects dollar floats and invalid tolerances", () => {
    expect(() =>
      reconcileSpendablePool({
        stripeAvailableCents: 4.55,
        ledgerSpendableCents: 455,
      }),
    ).toThrow("stripeAvailableCents must be an integer number of cents");

    expect(() =>
      reconcileSpendablePool(
        { stripeAvailableCents: 455, ledgerSpendableCents: 455 },
        -1,
      ),
    ).toThrow("toleranceCents must be a non-negative safe integer");
  });

  it("treats exact match as ok", () => {
    expect(
      reconcileSpendablePool({
        stripeAvailableCents: 450,
        ledgerSpendableCents: 450,
      }),
    ).toMatchObject({ driftCents: 0, ok: true });
  });
});
