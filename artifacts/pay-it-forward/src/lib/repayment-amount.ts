/**
 * Clamp a repayment choice to the outstanding balance and whole cents so the
 * amount shown in the UI always agrees with the amount the API can accept.
 */
export function getRepaymentMaxAmount(outstanding: number): number {
  if (!Number.isFinite(outstanding) || outstanding <= 0) return 0;

  const outstandingCents = outstanding * 100;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(outstandingCents));
  return Math.floor(outstandingCents + tolerance) / 100;
}

export function clampRepaymentAmount(amount: number, outstanding: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(outstanding) || amount <= 0 || outstanding <= 0) {
    return 0;
  }

  const requestedCents = Math.round(amount * 100);
  const outstandingCents = Math.round(getRepaymentMaxAmount(outstanding) * 100);
  return Math.min(requestedCents, outstandingCents) / 100;
}
