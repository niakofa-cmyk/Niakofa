#!/usr/bin/env node

import { createRequire } from "node:module";

const requireFromApi = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const Stripe = requireFromApi("stripe").default;

const secretKey = process.env.STRIPE_TEST_SECRET_KEY;
const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
const expectedCommit = process.env.EXPECTED_COMMIT?.trim();
const baseUrl = process.env.BASE_URL;
const mutationsAllowed = process.env.ALLOW_STRIPE_TEST_MUTATIONS === "1";

function fail(message) {
  console.error(`Stripe certification failed: ${message}`);
  process.exit(1);
}

if (!secretKey || !webhookSecret || !expectedCommit || !baseUrl) {
  fail("STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET, BASE_URL, and EXPECTED_COMMIT are required.");
}
if (!/^[0-9a-fA-F]{7,40}$/.test(expectedCommit)) {
  fail("EXPECTED_COMMIT must be a 7-40 character Git commit SHA.");
}
if (!mutationsAllowed) {
  fail("set ALLOW_STRIPE_TEST_MUTATIONS=1 to permit a test-mode charge and refund.");
}

const stripe = new Stripe(secretKey);
let base;
try {
  base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("unsafe URL");
  }
} catch {
  fail("BASE_URL must be a credential-free http(s) URL.");
}

const versionResponse = await fetch(new URL("/api/version", base), {
  headers: { Accept: "application/json" },
});
const version = await versionResponse.json().catch(() => ({}));
const deployedCommit = typeof version.commit === "string" ? version.commit.toLowerCase() : "";
const scope = expectedCommit.toLowerCase();
if (
  !versionResponse.ok ||
  !deployedCommit ||
  !(deployedCommit.startsWith(scope) || scope.startsWith(deployedCommit))
) {
  fail(`deployed commit ${deployedCommit || "unknown"} does not match EXPECTED_COMMIT ${scope}.`);
}

const balance = await stripe.balance.retrieve();
if (balance.livemode) {
  fail("the configured Stripe account is in live mode; refusing certification mutations.");
}

const paymentIntent = await stripe.paymentIntents.create({
  amount: 50,
  currency: "usd",
  payment_method: "pm_card_visa",
  payment_method_types: ["card"],
  confirm: true,
  description: "Niakofa restart/payment certification — automatically refunded",
  metadata: { purpose: "niakofa_acceptance", commit: scope },
}, {
  idempotencyKey: `niakofa-certification-payment-${scope}`,
});

if (paymentIntent.status !== "succeeded" || !paymentIntent.latest_charge) {
  fail(`test PaymentIntent did not succeed (status ${paymentIntent.status}).`);
}

const chargeId = typeof paymentIntent.latest_charge === "string"
  ? paymentIntent.latest_charge
  : paymentIntent.latest_charge.id;
let charge = await stripe.charges.retrieve(chargeId);
if (charge.refunded !== true) {
  await stripe.refunds.create({
    charge: chargeId,
    metadata: { purpose: "niakofa_acceptance", commit: scope },
  }, {
    idempotencyKey: `niakofa-certification-refund-${scope}`,
  });
  charge = await stripe.charges.retrieve(chargeId);
}
if (charge.refunded !== true || charge.amount_refunded !== charge.amount) {
  fail("test charge was not fully refunded.");
}

const fixture = JSON.stringify({
  id: `evt_niakofa_${scope.slice(0, 12)}`,
  object: "event",
  api_version: "2024-06-20",
  created: 0,
  data: { object: { id: paymentIntent.id, object: "payment_intent" } },
  livemode: false,
  pending_webhooks: 0,
  request: null,
  type: "payment_intent.succeeded",
});
const signature = stripe.webhooks.generateTestHeaderString({
  payload: fixture,
  secret: webhookSecret,
});
const verifiedEvent = stripe.webhooks.constructEvent(fixture, signature, webhookSecret);
if (verifiedEvent.type !== "payment_intent.succeeded") {
  fail("signed webhook fixture did not verify.");
}

const webhookResponse = await fetch(new URL("/api/stripe/webhook", base), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Stripe-Signature": signature,
  },
  body: fixture,
});
if (!webhookResponse.ok) {
  fail(`deployed webhook rejected a valid signed event (HTTP ${webhookResponse.status}).`);
}

process.stdout.write("PASS: Stripe test-mode PaymentIntent succeeded\n");
process.stdout.write("PASS: Stripe test-mode charge fully refunded\n");
process.stdout.write("PASS: Stripe webhook signature verified locally and by deployed endpoint\n");
process.stdout.write("NOTE: Stripe Connect transfers and wallet cashouts require a disposable connected account and are covered by offline route/worker regressions in this pass\n");