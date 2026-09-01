/**
 * Stripe credentials are kept in Replit Secrets. The plural names are the
 * session's canonical names; singular names remain a backwards-compatible
 * fallback for existing deployments and tests.
 */
export function getStripeSecretKey(): string {
  return process.env["STRIPE_SECRET_KEYS"] ?? process.env["STRIPE_SECRET_KEY"] ?? "";
}

export function getStripeWebhookSecret(): string {
  return process.env["STRIPE_WEBHOOK_SECRETS"] ?? process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
}