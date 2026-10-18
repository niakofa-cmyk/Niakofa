/**
 * Stripe credentials are kept in Replit Secrets. The plural names are the
 * session's canonical names; singular names remain a backwards-compatible
 * fallback for existing deployments and tests.
 */
export function getStripeSecretKey(): string {
  if (process.env["NODE_ENV"] === "development") {
    const testKey = process.env["STRIPE_TEST_SECRET_KEY"]?.trim() ?? "";
    return testKey.startsWith("sk_test_") ? testKey : "";
  }

  return process.env["STRIPE_SECRET_KEYS"] ?? process.env["STRIPE_SECRET_KEY"] ?? "";
}

export function getStripeWebhookSecret(): string {
  if (process.env["NODE_ENV"] === "development") {
    return process.env["STRIPE_TEST_WEBHOOK_SECRET"]?.trim() ?? "";
  }

  return process.env["STRIPE_WEBHOOK_SECRETS"] ?? process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
}