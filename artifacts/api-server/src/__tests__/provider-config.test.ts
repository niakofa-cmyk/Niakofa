import { afterEach, describe, expect, it } from "@jest/globals";
import { getMapboxToken } from "../lib/mapbox-config.js";
import { getStripeSecretKey, getStripeWebhookSecret } from "../lib/stripe-config.js";

const ENV_KEYS = [
  "NODE_ENV",
  "MAPBOX_TOKEN",
  "VITE_MAPBOX_TOKEN",
  "STRIPE_SECRET_KEYS",
  "STRIPE_SECRET_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRETS",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_TEST_WEBHOOK_SECRET",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("development provider configuration", () => {
  it("prefers the working browser Mapbox token in development", () => {
    process.env.NODE_ENV = "development";
    process.env.MAPBOX_TOKEN = "invalid-server-token";
    process.env.VITE_MAPBOX_TOKEN = "pk.public-token";

    expect(getMapboxToken()).toBe("pk.public-token");
  });

  it("keeps the server Mapbox token first outside development", () => {
    process.env.NODE_ENV = "production";
    process.env.MAPBOX_TOKEN = "server-token";
    process.env.VITE_MAPBOX_TOKEN = "public-token";

    expect(getMapboxToken()).toBe("server-token");
  });

  it("never falls back to live Stripe credentials in development", () => {
    process.env.NODE_ENV = "development";
    process.env.STRIPE_SECRET_KEYS = "sk_live_shared";
    process.env.STRIPE_SECRET_KEY = "sk_live_legacy";
    process.env.STRIPE_WEBHOOK_SECRETS = "whsec_live_shared";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_live_legacy";
    delete process.env.STRIPE_TEST_SECRET_KEY;
    delete process.env.STRIPE_TEST_WEBHOOK_SECRET;

    expect(getStripeSecretKey()).toBe("");
    expect(getStripeWebhookSecret()).toBe("");
  });

  it("accepts only test-mode Stripe secret keys in development", () => {
    process.env.NODE_ENV = "development";
    process.env.STRIPE_SECRET_KEYS = "sk_live_shared";
    process.env.STRIPE_TEST_SECRET_KEY = "sk_test_development";
    process.env.STRIPE_TEST_WEBHOOK_SECRET = "whsec_development";

    expect(getStripeSecretKey()).toBe("sk_test_development");
    expect(getStripeWebhookSecret()).toBe("whsec_development");
  });
});
