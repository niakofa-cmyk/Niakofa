export type PoolReconciliationSnapshot = {
  stripeAvailableCents: number;
  ledgerSpendableCents: number;
};

export type ReconciliationResult = {
  expectedCents: number;
  observedCents: number;
  driftCents: number;
  ok: boolean;
};

/**
 * Compare only spendable funds with spendable funds.
 *
 * Stripe pending funds, fees, climate allocations, payouts, and unrelated
 * platform balances must not be silently folded into this comparison. The
 * caller is responsible for producing the two scoped integer-cent values.
 *
 * Default tolerance is 1 cent (documented rounding allowance only).
 * Any larger unexplained difference is an investigation condition.
 */
export function reconcileSpendablePool(
  snapshot: PoolReconciliationSnapshot,
  toleranceCents = 1,
): ReconciliationResult {
  for (const [name, value] of Object.entries(snapshot)) {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${name} must be an integer number of cents`);
    }
  }
  if (!Number.isSafeInteger(toleranceCents) || toleranceCents < 0) {
    throw new Error("toleranceCents must be a non-negative safe integer");
  }

  const expectedCents = snapshot.stripeAvailableCents;
  const observedCents = snapshot.ledgerSpendableCents;
  const driftCents = observedCents - expectedCents;

  return {
    expectedCents,
    observedCents,
    driftCents,
    ok: Math.abs(driftCents) <= toleranceCents,
  };
}
