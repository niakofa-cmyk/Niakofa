/**
 * Offline wallet cashout tests.
 *
 * Covers the highest-risk route boundary and the reserve -> Stripe transfer ->
 * completed ledger path without requiring Postgres, Redis, or live Stripe.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

const tx: any = {
  execute: jest.fn(),
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn(),
};

const db: any = {
  transaction: jest.fn(async (callback: (value: any) => Promise<unknown>) => callback(tx)),
};

const transferCreate = jest.fn();

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  walletCashoutsTable: { id: "id", user_id: "user_id", state: "state" },
  usersTable: { id: "id", benevolence_wallet: "benevolence_wallet" },
  stripeAccountsTable: { user_id: "user_id", stripe_account_id: "stripe_account_id", payouts_enabled: "payouts_enabled" },
  transactionsTable: {},
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(),
  sql: jest.fn(),
  desc: jest.fn(),
}));

jest.unstable_mockModule("stripe", () => ({
  default: class StripeMock {
    transfers = { create: transferCreate };
    accounts = { retrieve: jest.fn() };
    payouts = { create: jest.fn() };
  },
}));

const requireApproved = jest.fn((_req: any, _res: any, next: any) => next());

jest.unstable_mockModule("../middlewares/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.authenticatedUserId = 42;
    next();
  },
  requireApproved,
}));

jest.unstable_mockModule("../middlewares/authz.js", () => ({
  requireAdmin: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule("../middlewares/rate-limit.js", () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => next(),
  adminLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule("../lib/queue.js", () => ({
  enqueueCashoutRetry: jest.fn(),
}));

jest.unstable_mockModule("../lib/stripe-cashout.js", () => ({
  buildCashoutTransferParams: jest.fn((input: unknown) => input),
  cashoutIdempotencyKey: jest.fn((id: number) => `cashout-${id}`),
}));

jest.unstable_mockModule("../lib/db-helpers.js", () => ({
  getSystemSetting: jest.fn(),
}));

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  broadcast: jest.fn(),
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

let app: express.Express;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "offline-test-key";
  const { default: walletRouter } = await import("../routes/wallet.js");
  app = express();
  app.use(express.json());
  app.use("/api", walletRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  requireApproved.mockImplementation((_req: any, _res: any, next: any) => next());
  tx.execute.mockResolvedValue([
    { id: 42, benevolence_wallet: 20, is_helper: true },
  ]);
  tx.limit.mockResolvedValue([
    { stripe_account_id: "acct_helper", payouts_enabled: true },
  ]);
  tx.returning
    .mockResolvedValueOnce([{ id: 9 }]) // Phase 1 cashout insert
    .mockResolvedValueOnce([{ id: 9 }]); // Phase 3 state guard
  transferCreate.mockResolvedValue({ id: "tr_cashout_1" });
});

describe("POST /api/wallet/cashout", () => {
  it("blocks a suspended account before reserving wallet funds", async () => {
    requireApproved.mockImplementationOnce((_req: any, res: any) =>
      res.status(403).json({ error: "Account suspended — contact support" }),
    );

    const response = await request(app)
      .post("/api/wallet/cashout")
      .send({ amount: 10 });

    expect(response.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(transferCreate).not.toHaveBeenCalled();
  });

  it("reserves, transfers, and commits one cashout with a stable idempotency key", async () => {
    const response = await request(app)
      .post("/api/wallet/cashout")
      .send({ amount: 10, description: "Test cashout" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      transferId: "tr_cashout_1",
      amount: 10,
      newBalance: 10,
      payout_method: "standard",
    });
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(transferCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        cashout_id: 9,
        user_id: 42,
        stripe_account_id: "acct_helper",
        amount_cents: 1000,
      }),
      { idempotencyKey: "cashout-9" },
    );
    expect(tx.insert).toHaveBeenCalled();
  });
});