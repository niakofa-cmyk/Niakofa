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
};

const stripeConstructEvent = jest.fn();
const stripeChargeRetrieve = jest.fn();
const drizzleEq = jest.fn();

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  stripeAccountsTable: { user_id: "user_id", stripe_account_id: "stripe_account_id" },
  paymentTransactionsTable: {
    stripe_payment_intent_id: "stripe_payment_intent_id",
    stripe_transfer_id: "stripe_transfer_id",
    state: "state",
  },
  usersTable: { id: "id" },
  requestsTable: { id: "id", title: "title" },
  transactionsTable: {},
  communityPoolLedgerTable: {},
  walletCashoutsTable: { id: "id", state: "state" },
  diasporaHubsTable: { id: "id" },
  diasporaHubPledgesTable: { id: "id" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  and: jest.fn(),
  eq: drizzleEq,
  sql: jest.fn(),
}));

jest.unstable_mockModule("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEvent: stripeConstructEvent };
    charges = { retrieve: stripeChargeRetrieve };
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
}));

jest.unstable_mockModule("../middlewares/rate-limit", () => ({
  paymentLimiter: (_req: unknown, _res: unknown, next: unknown) => next(),
}));

jest.unstable_mockModule("../lib/ws-hub", () => ({
  broadcast: jest.fn(),
}));

jest.unstable_mockModule("../routes/push", () => ({
  sendPushToUser: jest.fn(),
}));

jest.unstable_mockModule("../lib/community-pool", () => ({
  wasRequestFronted: jest.fn(),
  recordPoolContribution: jest.fn(),
  getPoolBalance: jest.fn(),
  processPendingMinimums: jest.fn(),
  syncHubReservedBalance: jest.fn(),
}));

jest.unstable_mockModule("../lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

let app: express.Express;
let requireApproved: jest.Mock;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "offline-test-key";
  process.env.STRIPE_WEBHOOK_SECRET = "offline-webhook-secret";
  const auth = await import("../middlewares/auth");
  requireApproved = auth.requireApproved as unknown as jest.Mock;
  const { default: stripeRouter } = await import("../routes/stripe");
  app = express();
  app.use(express.json());
  app.use("/api", stripeRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  db.update.mockReturnThis();
  db.set.mockReturnThis();
  db.where.mockReturnThis();
  db.select.mockReturnThis();
  db.from.mockReturnThis();
  db.limit.mockResolvedValue([]);
  db.returning.mockResolvedValue([]);
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

describe("POST /api/stripe/webhook", () => {
  it("skips all money side effects when payment intent was already completed", async () => {
    stripeConstructEvent.mockReturnValue({
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