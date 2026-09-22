/**
 * Community Pool spendable reconciliation (integer cents).
 *
 * Compares Stripe *available* USD balance (cents) to community_pool_ledger
 * spendable sum (cents). Pending Stripe funds are diagnostic only.
 * Tolerance: 1 cent. Larger drift is an investigation condition.
 */
import Stripe from "stripe";
import { getStripeSecretKey } from "./stripe-config";
import { logger } from "./logger";
import { workerRan } from "./worker-registry";
import { reconcileSpendablePool } from "./pool-reconciliation-invariants";

const DRIFT_ALERT_THRESHOLD_CENTS = 1;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function checkLedgerStripeDrift(): Promise<void> {
  const STRIPE_SECRET_KEY = getStripeSecretKey();
  if (!STRIPE_SECRET_KEY) {
    logger.debug("ledger-drift: STRIPE_SECRET_KEY not configured — skipping daily drift check");
    return;
  }

  try {
    const { db, communityPoolLedgerTable } = await import("@workspace/db");
    const { sql: sqlTag } = await import("drizzle-orm");

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });

    const [balRow] = await db
      .select({ balance: sqlTag<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
      .from(communityPoolLedgerTable);
    const ledgerSpendableCents = Math.round(Number(balRow?.balance ?? 0) * 100);

    const stripeBalance = await stripe.balance.retrieve();
    const stripeAvailableCents = stripeBalance.available
      .filter((b: { currency: string }) => b.currency === "usd")
      .reduce((s: number, b: { amount: number }) => s + b.amount, 0);
    const stripePendingCents = stripeBalance.pending
      .filter((b: { currency: string }) => b.currency === "usd")
      .reduce((s: number, b: { amount: number }) => s + b.amount, 0);

    const result = reconcileSpendablePool(
      {
        stripeAvailableCents,
        ledgerSpendableCents,
      },
      DRIFT_ALERT_THRESHOLD_CENTS,
    );

    const payload = {
      ledger_spendable_cents: result.observedCents,
      stripe_available_cents: result.expectedCents,
      stripe_pending_cents: stripePendingCents,
      drift_cents: result.driftCents,
      threshold_cents: DRIFT_ALERT_THRESHOLD_CENTS,
      ok: result.ok,
    };

    if (!result.ok) {
      logger.warn(
        payload,
        "ledger-drift: DAILY CHECK — spendable ledger vs Stripe available differs by more than 1 cent. " +
          "Investigate missed webhooks, unrecorded fees/Climate, or ledger bugs. " +
          "Pending Stripe funds are separate and must not mask this gap. " +
          "Also visible at GET /api/admin/pool/stripe-balance.",
      );
    } else {
      logger.info(payload, "ledger-drift: daily check OK — spendable ledger and Stripe available within 1 cent");
    }
  } catch (err) {
    logger.error({ err }, "ledger-drift: daily check failed — non-fatal, will retry tomorrow");
  }
}

/** Start daily ledger↔Stripe spendable drift check (5 min after boot, then daily). */
export function startLedgerDriftMonitor(): () => void {
  const startupDelay = setTimeout(() => {
    checkLedgerStripeDrift()
      .then(() => workerRan("ledger-drift", true))
      .catch((err: unknown) => {
        logger.error({ err }, "ledger-drift: startup check failed");
        workerRan("ledger-drift", false);
      });
  }, 5 * 60 * 1000);

  const interval = setInterval(() => {
    checkLedgerStripeDrift()
      .then(() => workerRan("ledger-drift", true))
      .catch((err: unknown) => {
        logger.error({ err }, "ledger-drift: interval check failed");
        workerRan("ledger-drift", false);
      });
  }, ONE_DAY_MS);

  logger.info(
    { intervalMs: ONE_DAY_MS, thresholdCents: DRIFT_ALERT_THRESHOLD_CENTS },
    "scheduler: ledger-stripe drift worker started (1-cent spendable tolerance)",
  );

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("scheduler: ledger-stripe drift worker stopped");
  };
}
