export interface PoolSettlementAccountingAmounts {
  grossAmountCents: number;
  stripeFeeCents: number;
  climateContributionCents: number;
  netAmountCents: number;
}

/**
 * The only valid settlement equation for a spendable Community Pool credit:
 *
 *   net = gross - Stripe fee - Climate contribution
 *
 * All values are integer cents. Keeping this as a pure predicate lets the
 * application and its focused tests share exactly the same rule as the SQL
 * constraint in 0118_community_pool_financial_integrity.sql.
 */
export function isPoolSettlementAccountingInvariant(
  amounts: PoolSettlementAccountingAmounts,
): boolean {
  const {
    grossAmountCents,
    stripeFeeCents,
    climateContributionCents,
    netAmountCents,
  } = amounts;

  return (
    Number.isSafeInteger(grossAmountCents) &&
    Number.isSafeInteger(stripeFeeCents) &&
    Number.isSafeInteger(climateContributionCents) &&
    Number.isSafeInteger(netAmountCents) &&
    grossAmountCents > 0 &&
    stripeFeeCents >= 0 &&
    climateContributionCents >= 0 &&
    netAmountCents >= 0 &&
    netAmountCents === grossAmountCents - stripeFeeCents - climateContributionCents
  );
}