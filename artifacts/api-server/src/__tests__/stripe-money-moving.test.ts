/**
 * High-risk Stripe route regressions.
 *
 * These tests deliberately stay offline: Stripe and the database are mocked,
 * while the Express middleware and route state guards are exercised end to
 * end.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: unknown = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  execute: jest.fn(),
};

const stripeConstructEvent = jest.fn();
const stripeChargeRetrieve = jest.fn();
const stripePaymentIntentCreate = jest.fn();
const stripePaymentIntentList = jest.fn();
const stripePaymentIntentRetrieve = jest.fn();
const stripeBalanceTransactionRetrieve = jest.fn();
const stripeAccountsRetrieve = jest.fn();
const recordPoolContribution = jest.fn();
const recordPoolContributionSettlement = jest.fn();
const drizzleEq = jest.fn();

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  stripeAccountsTable: { user_id: "user_id", stripe_account_id: "stripe_account_id" },
  paymentTransactionsTable: {
    stripe_payment_intent_id: "stripe_payment_intent_id",
    stripe_transfer_id: "stripe_transfer_id",
    state: "state",
  },
  usersTable: { id: "id", community_id: "community_id" },
  requestsTable: { id: "id", title: "title" },
  transactionsTable: {},
  communityPoolLedgerTable: {},
  communityPoolFinancialEventsTable: {},
  poolPendingMinimumsTable: {},
  walletCashoutsTable: { id: "id", state: "state" },
  diasporaHubsTable: { id: "id" },
  diasporaHubPledgesTable: { id: "id" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  and: jest.fn(),
  desc: jest.fn(),
  eq: drizzleEq,
  sql: jest.fn(),
}));

jest.unstable_mockModule("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEvent: stripeConstructEvent };
    charges = { retrieve: stripeChargeRetrieve };
    paymentIntents = {
      create: stripePaymentIntentCreate,
      list: stripePaymentIntentList,
      retrieve: stripePaymentIntentRetrieve,
    };
    balanceTransactions = { retrieve: stripeBalanceTransactionRetrieve };
    accounts = { retrieve: stripeAccountsRetrieve };
  },
}));

jest.unstable_mockModule("../middlewares/auth", () => ({
  requireAuth: (req: unknown, _res: unknown, next: unknown) => {
    req.authenticatedUserId = 42;
    req.authenticatedTokenVersion = 0;
    next();
  },
  requireApproved: jest.fn((req: unknown, _res: unknown, next: unknown) => next()),
}));

jest.unstable_mockModule("../middlewares/authz", () => ({
  requireOwnership: (_field: string) => (_req: unknown, _res: unknown, next: unknown) => next(),
  requireAdmin: () => (_req: unknown, _res: unknown, next: unknown) => next(),
}));

jest.unstable_mockModule("../middlewares/rate-limit", () => ({
  paymentLimiter: (_req: unknown, _res: unknown, next: unknown) => next(),
  generalApiLimiter: (_req: unknown, _res: unknown, next: unknown) => next(),
  adminLimiter: (_req: unknown, _res: unknown, next: unknown) => next(),
}));

jest.unstable_mockModule("../lib/ws-hub", () => ({
  broadcast: jest.fn(),
}));

jest.unstable_mockModule("../routes/push", () => ({
  sendPushToUser: jest.fn(),
}));

jest.unstable_mockModule("../lib/community-pool", () => ({
  wasRequestFronted: jest.fn(),
  recordPoolContribution,
  recordPoolContributionSettlement,
  getPoolBalance: jest.fn(),
  getGuaranteedMinimum: jest.fn(),
  getHourlyMinimumRate: jest.fn(),
  isPoolEnabled: jest.fn(),
  processPendingMinimums: jest.fn(),
  syncHubReservedBalance: jest.fn(),
}));

jest.unstable_mockModule("../lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

let app: express.Express;
let requireApproved: jest.Mock;
let canRecordPoolContributionWithoutStripe: (nodeEnv?: string) => boolean;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "offline-test-key";
  process.env.STRIPE_WEBHOOK_SECRET = "offline-webhook-secret";
  const auth = await import("../middlewares/auth");
  requireApproved = auth.requireApproved as unknown as jest.Mock;
  const { default: stripeRouter } = await import("../routes/stripe");
  const pool = await import("../routes/pool");
  const { default: poolStripeReconciliationRouter } = await import("../routes/pool-stripe-reconciliation");
  canRecordPoolContributionWithoutStripe = pool.canRecordPoolContributionWithoutStripe;
  app = express();
  app.use(express.json());
  app.use("/api", stripeRouter);
  app.use("/api", pool.default);
  app.use("/api", poolStripeReconciliationRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  db.update.mockReturnThis();
  db.set.mockReturnThis();
  db.where.mockReturnThis();
  db.select.mockReturnThis();
  db.from.mockReturnThis();
  db.execute.mockResolvedValue({ rows: [] });
  db.limit.mockResolvedValue([]);
  db.returning.mockResolvedValue([]);
  stripePaymentIntentCreate.mockResolvedValue({
    id: "pi_pool_test",
    client_secret: "pi_pool_test_secret",
  });
  stripePaymentIntentList.mockResolvedValue({ data: [], has_more: false });
  stripePaymentIntentRetrieve.mockResolvedValue({
    id: "pi_pool_test",
    amount: 500,
    amount_received: 500,
    currency: "usd",
    livemode: true,
    status: "succeeded",
    latest_charge: "ch_pool_test",
    metadata: { pool_contribution: "true", user_id: "42" },
  });
  stripeChargeRetrieve.mockResolvedValue({
    id: "ch_pool_test",
    balance_transaction: "txn_pool_test",
  });
  stripeBalanceTransactionRetrieve.mockResolvedValue({
    id: "txn_pool_test",
    currency: "usd",
    fee: 45,
    net: 455,
    status: "available",
    available_on: 1_756_000_000,
  });
  stripeAccountsRetrieve.mockResolvedValue({ id: "acct_test" });
});

describe("POST /api/stripe/payment-intent", () => {
  it("runs the approval gate before creating a charge", async () => {
    requireApproved.mockImplementationOnce((_req: unknown, res: unknown) =>
      res.status(403).json({ error: "Account suspended — contact support" }),
    );
    const response = await request(app)
      .post("/api/stripe/payment-intent")
      .send({ requestId: 1, amount: 10 });

    expect(response.status).toBe(403);
    expect(requireApproved).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("POST /api/pool/contribute", () => {
  it("uses a distinct Stripe idempotency key for each unkeyed payment attempt", async () => {
    const first = await request(app)
      .post("/api/pool/contribute")
      .send({ amount: 25 });
    const second = await request(app)
      .post("/api/pool/contribute")
      .send({ amount: 25 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(stripePaymentIntentCreate).toHaveBeenCalledTimes(2);

    const firstOptions = stripePaymentIntentCreate.mock.calls[0][1] as { idempotencyKey: string };
    const secondOptions = stripePaymentIntentCreate.mock.calls[1][1] as { idempotencyKey: string };
    expect(firstOptions.idempotencyKey).toEqual(expect.any(String));
    expect(secondOptions.idempotencyKey).toEqual(expect.any(String));
    expect(firstOptions.idempotencyKey).not.toBe(secondOptions.idempotencyKey);
  });

  it("attaches the contributor's community to the Stripe PaymentIntent", async () => {
    db.limit.mockResolvedValueOnce([{ community_id: 7 }]);

    const response = await request(app)
      .post("/api/pool/contribute")
      .send({ amount: 25 });

    expect(response.status).toBe(200);
    expect(stripePaymentIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          pool_contribution: "true",
          user_id: "42",
          community_id: "7",
        }),
      }),
      expect.any(Object),
    );
  });

  it("preserves the caller's idempotency key for safe retries", async () => {
    const response = await request(app)
      .post("/api/pool/contribute")
      .set("Idempotency-Key", "pool-attempt-123")
      .send({ amount: 25 });

    expect(response.status).toBe(200);
    expect(stripePaymentIntentCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 2500 }),
      { idempotencyKey: "pool-attempt-123" },
    );
  });

  it("allows direct recording only outside production", () => {
    expect(canRecordPoolContributionWithoutStripe("development")).toBe(true);
    expect(canRecordPoolContributionWithoutStripe("test")).toBe(true);
    expect(canRecordPoolContributionWithoutStripe("production")).toBe(false);
  });
});

describe("GET /api/pool/stripe/reconciliation", () => {
  it("bounds paginated Stripe scans and reports when the result is truncated", async () => {
    stripePaymentIntentList.mockImplementation(async (params: { starting_after?: string }) => ({
      data: [{ id: `pi_page_${params.starting_after ?? "first"}`, status: "requires_payment_method", metadata: {} }],
      has_more: true,
    }));
    stripeAccountsRetrieve.mockResolvedValue({ id: "acct_test" });

    const response = await request(app)
      .get("/api/pool/stripe/reconciliation?days=90");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      pages_scanned: 5,
      truncated: true,
      stripe_account_id: "acct_test",
      missing_ledger_count: 0,
    });
    expect(stripePaymentIntentList).toHaveBeenCalledTimes(5);
    expect(stripePaymentIntentList.mock.calls[1][0]).toEqual(expect.objectContaining({
      starting_after: "pi_page_first",
    }));
  });
});

describe("POST /api/stripe/webhook", () => {
  it("records authoritative gross, Stripe fee, Climate deduction, and net pool funds", async () => {
    stripeConstructEvent.mockReturnValue({
      id: "evt_pool_settlement",
      livemode: true,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_pool_settlement",
          amount: 500,
          metadata: {
            pool_contribution: "true",
            user_id: "42",
            climate_contribution_cents: "5",
            stripe_climate_transaction_id: "txn_climate",
          },
        },
      },
    });
    stripePaymentIntentRetrieve.mockResolvedValue({
      id: "pi_pool_settlement",
      amount: 500,
      amount_received: 500,
      currency: "usd",
      livemode: true,
      status: "succeeded",
      latest_charge: "ch_pool_settlement",
      metadata: {
        pool_contribution: "true",
        user_id: "42",
        climate_contribution_cents: "5",
        stripe_climate_transaction_id: "txn_climate",
      },
    });
    stripeChargeRetrieve.mockResolvedValue({
      id: "ch_pool_settlement",
      balance_transaction: "txn_pool_settlement",
    });
    stripeBalanceTransactionRetrieve.mockResolvedValue({
      id: "txn_pool_settlement",
      currency: "usd",
      fee: 45,
      net: 455,
      status: "available",
      available_on: 1_756_000_000,
    });
    recordPoolContribution.mockResolvedValueOnce(true);

    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "offline-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify({ id: "evt_pool_settlement", type: "payment_intent.succeeded" }));

    expect(response.status).toBe(200);
    expect(recordPoolContribution).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5,
      settlement: expect.objectContaining({
        grossAmountCents: 500,
        stripeFeeCents: 45,
        climateContributionCents: 5,
        netAmountCents: 450,
        stripeBalanceTransactionId: "txn_pool_settlement",
        stripeClimateTransactionId: "txn_climate",
        settlementStatus: "available",
      }),
    }));
  });

  it("returns 500 when financial processing fails so Stripe retries", async () => {
    stripeConstructEvent.mockReturnValue({
      id: "evt_processing_failure",
      livemode: true,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_pool_failure",
          amount: 500,
          metadata: { pool_contribution: "true", user_id: "42" },
        },
      },
    });
    recordPoolContribution.mockRejectedValueOnce(new Error("ledger unavailable"));

    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "offline-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify({ id: "evt_processing_failure", type: "payment_intent.succeeded" }));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      received: false,
      error: "Webhook processing failed; Stripe should retry.",
    });
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("keeps invalid signatures as 400 and does not record an unverified event", async () => {
    stripeConstructEvent.mockImplementationOnce(() => {
      throw new Error("signature mismatch");
    });

    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "invalid-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify({ id: "evt_invalid_signature", type: "payment_intent.succeeded" }));

    expect(response.status).toBe(400);
    expect(response.text).toContain("signature mismatch");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("skips all money side effects when payment intent was already completed", async () => {
    stripeConstructEvent.mockReturnValue({
      id: "evt_1",
      livemode: true,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_already_done", amount: 1000, metadata: {} } },
    });
    db.returning.mockResolvedValueOnce([]);

    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "offline-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("links an early transfer.created event through its source charge", async () => {
    stripeConstructEvent.mockReturnValue({
      id: "evt_transfer",
      livemode: true,
      type: "transfer.created",
      data: {
        object: {
          id: "tr_early",
          destination: "acct_helper",
          source_transaction: "ch_source",
          metadata: {},
        },
      },
    });
    stripeChargeRetrieve.mockResolvedValue({ payment_intent: "pi_source" });

    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "offline-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify({ id: "evt_transfer", type: "transfer.created" }));

    expect(response.status).toBe(200);
    expect(stripeChargeRetrieve).toHaveBeenCalledWith("ch_source");
    expect(drizzleEq).toHaveBeenCalledWith("stripe_payment_intent_id", "pi_source");
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.where).toHaveBeenCalled();
  });
});