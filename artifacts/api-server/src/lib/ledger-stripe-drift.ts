/** Daily transaction-level audit of successful Stripe-backed pool contributions. */
import Stripe from "stripe";
import { getStripeSecretKey } from "./stripe-config";
import { logger } from "./logger";
import { workerRan } from "./worker-registry";
import { scanRecentPoolContributions } from "./pool-stripe-reconciliation";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RECONCILIATION_WORKER_ID = "pool-stripe-reconciliation";
const RECONCILIATION_LOOKBACK_DAYS = 30;

export async function checkPoolStripeReconciliation(): Promise<boolean> {
  const STRIPE_SECRET_KEY = getStripeSecretKey();
  if (!STRIPE_SECRET_KEY) {
    logger.debug("pool-stripe-reconciliation: Stripe is not configured — transaction audit skipped");
    return false;
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    timeout: 10_000,
  });
  const result = await scanRecentPoolContributions(stripe, RECONCILIATION_LOOKBACK_DAYS);
  const complete =
    !result.truncated &&
    result.missing_ledger_count === 0 &&
    result.missing_financial_event_count === 0 &&
    result.duplicate_ledger_count === 0;
  const payload = {
    lookback_days: RECONCILIATION_LOOKBACK_DAYS,
    pages_scanned: result.pages_scanned,
    pool_payment_intents_scanned: result.pool_payment_intents_scanned,
    truncated: result.truncated,
    missing_ledger_count: result.missing_ledger_count,
    missing_financial_event_count: result.missing_financial_event_count,
    duplicate_ledger_count: result.duplicate_ledger_count,
    complete,
  };

  if (complete) {
    logger.info(
      payload,
      "pool-stripe-reconciliation: all scanned Stripe-backed pool contributions have ledger and financial-event records",
    );
  } else {
    logger.warn(
      payload,
      "pool-stripe-reconciliation: missing records or incomplete coverage; non-Stripe grant/sponsor funding is outside this transaction-level audit",
    );
  }
  return complete;
}

/** Start a bounded transaction-level audit (5 min after boot, then daily). */
export function startPoolStripeReconciliationMonitor(): () => void {
  const run = async (source: "startup" | "daily") => {
    try {
      workerRan(RECONCILIATION_WORKER_ID, await checkPoolStripeReconciliation());
    } catch (err) {
      logger.error({ err }, `pool-stripe-reconciliation: ${source} audit failed`);
      workerRan(RECONCILIATION_WORKER_ID, false);
    }
  };

  const startupDelay = setTimeout(() => {
    void run("startup");
  }, 5 * 60 * 1000);

  const interval = setInterval(() => {
    void run("daily");
  }, ONE_DAY_MS);

  logger.info({ intervalMs: ONE_DAY_MS, lookbackDays: RECONCILIATION_LOOKBACK_DAYS }, "pool-stripe-reconciliation: daily monitor started");

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("pool-stripe-reconciliation: monitor stopped");
  };
}
