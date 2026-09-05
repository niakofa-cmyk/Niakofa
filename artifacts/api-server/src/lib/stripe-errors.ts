/**
 * Stripe error classification utilities.
 *
 * "Ambiguous" errors are those where the HTTP call may have reached Stripe
 * before failing — Stripe might have created the transfer even though we got
 * an error back.  In these cases we MUST NOT auto-refund because the funds
 * may already be in flight.
 *
 * "Definitive" errors are those where Stripe unambiguously rejected the
 * request before touching any balance (authentication failures, invalid
 * destination, bad parameters, etc.).  Here a refund is safe.
 */

/**
 * Returns true when a Stripe error is ambiguous — i.e. it's unclear whether
 * Stripe actually processed the request. These are network-level errors where
 * the API call may have landed on Stripe's servers before the timeout or
 * connection reset fired on our side.
 *
 * Ambiguous = do NOT auto-refund.  Escalate to `reconciliation_required`.
 * Definitive = safe to refund.
 */
export function isAmbiguousStripeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const stripeType = (err as { type?: string }).type;
  const errCode = (err as { code?: string }).code;

  // Stripe SDK wraps network issues in StripeConnectionError.
  // Ambiguous: connection may have delivered the request before the reset.
  if (stripeType === "StripeConnectionError") return true;

  if (stripeType === "StripeAPIError") {
    // Stripe received the request but processing exceeded timeout — may complete.
    if (errCode === "request_timeout") return true;
  }

  if (stripeType === "StripeInvalidRequestError") {
    // idempotency_key_mismatch: same key was used with different params in this
    //   call — the original request (sent by an older code path) may have
    //   succeeded, so we cannot determine the outcome.
    // idempotency_key_in_use: a prior request with this key is still processing
    //   — definitively ambiguous.
    if (errCode === "idempotency_key_mismatch" || errCode === "idempotency_key_in_use") {
      return true;
    }
  }

  // Node.js network codes — bytes may have been delivered before interruption.
  const nodeCode = (err as { code?: string }).code;
  const ambiguousNodeCodes = ["ETIMEDOUT", "ECONNRESET", "ESOCKETTIMEDOUT", "EAI_AGAIN", "EPIPE"];
  if (nodeCode && ambiguousNodeCodes.includes(nodeCode)) return true;

  return false;
}

/**
 * Stripe Accounts v2 can expose legacy `capabilities.transfers = active` while
 * still rejecting Transfers because the recipient configuration lacks
 * `stripe_balance.stripe_transfers`. Stripe rejects these requests before
 * moving money, so retrying cannot help until account configuration changes.
 */
export function isStripeTransferCapabilityError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "insufficient_capabilities_for_transfer";
}
