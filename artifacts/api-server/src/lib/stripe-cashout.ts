/**
 * Canonical Stripe transfer payload builder for benevolence_wallet cashouts.
 *
 * All three paths that fire a Stripe transfer with idempotency key
 * `cashout-${id}` MUST use this builder — the route, the BullMQ retry
 * worker, and the reconciliation cron. Stripe idempotency requires exact
 * parameter parity: reusing the same key with different params returns a
 * `idempotency_key_mismatch` error instead of the original transfer, which
 * can lead to incorrect refund decisions.
 *
 * The canonical payload intentionally:
 *   • Uses a fixed description (no user-supplied text — that text is not
 *     stored in wallet_cashouts so workers can't reproduce it).
 *   • Omits per-attempt flags (retried, attempt, reconciled_by) from metadata
 *     — those vary per call and would break idempotency parity.
 */
import type Stripe from "stripe";

export interface CashoutTransferParams {
  cashout_id: number;
  user_id: number;
  stripe_account_id: string;
  /** Amount in cents (integer). */
  amount_cents: number;
}

/** Returns the canonical Stripe TransferCreateParams for a cashout row. */
export function buildCashoutTransferParams(
  p: CashoutTransferParams
): Stripe.TransferCreateParams {
  return {
    amount: p.amount_cents,
    currency: "usd",
    destination: p.stripe_account_id,
    description: "Niakofa — Goodwill Fund cashout",
    metadata: {
      cashout_id: String(p.cashout_id),
      user_id: String(p.user_id),
      source: "benevolence_wallet",
    },
  };
}

/** Returns the canonical idempotency key for a cashout row. */
export function cashoutIdempotencyKey(cashout_id: number): string {
  return `cashout-${cashout_id}`;
}
