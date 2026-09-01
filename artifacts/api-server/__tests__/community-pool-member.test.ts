/**
 * Focused regression coverage for member-scoped Community Pool routes.
 *
 * These tests intentionally mount poolRouter directly and mock the database
 * query builder. They verify the authorization boundary without requiring a
 * live Postgres, Redis, or Stripe connection.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import express from "express";

const usersColumns = { id: "users.id", community_id: "users.community_id" };
const poolColumns = {
  id: "pool.id",
  community_id: "pool.community_id",
  entry_type: "pool.entry_type",
  amount: "pool.amount",
  notes: "pool.notes",
  created_at: "pool.created_at",
};

const pendingMinimumColumns = { status: "pending.status", amount: "pending.amount" };
const awaitedQueryResults: unknown[] = [];

const mockDb: Record<string, jest.Mock> = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
  execute: jest.fn().mockResolvedValue({ rows: [] }),
  then: jest.fn(),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  usersTable: usersColumns,
  communityPoolLedgerTable: poolColumns,
  communityPoolFinancialEventsTable: {},
  poolPendingMinimumsTable: pendingMinimumColumns,
  requestsTable: {
    pledge_amount: "requests.pledge_amount",
    pledge_paid: "requests.pledge_paid",
    payment_type: "requests.payment_type",
    status: "requests.status",
  },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn((column: unknown, value: unknown) => ({ _eq: [column, value] })),
  desc: jest.fn((column: unknown) => ({ _desc: column })),
  sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: [...strings],
    values,
  })),
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  requireAuth: jest.fn(),
}));

jest.unstable_mockModule("../src/middlewares/authz.js", () => ({
  requireAdmin: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
jest.unstable_mockModule("../src/middlewares/rate-limit.js", () => ({
  paymentLimiter: passthrough,
  generalApiLimiter: passthrough,
  adminLimiter: passthrough,
}));

jest.unstable_mockModule("../src/lib/community-pool.js", () => ({
  getPoolBalance: jest.fn().mockResolvedValue(0),
  getGuaranteedMinimum: jest.fn().mockResolvedValue(5),
  getHourlyMinimumRate: jest.fn().mockResolvedValue(5),
  getPoolReservePolicy: jest.fn().mockResolvedValue({
    helpersCovered: 10,
    guaranteedHours: 4,
    safetyMultiplier: 1.25,
  }),
  roundMoney: jest.fn((amount: number) => Math.round(amount * 100) / 100),
  isPoolEnabled: jest.fn().mockResolvedValue(true),
  recordPoolContribution: jest.fn(),
  processPendingMinimums: jest.fn(),
}));

jest.unstable_mockModule("../src/lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule("../src/lib/ws-hub.js", () => ({
  broadcast: jest.fn(),
}));

jest.unstable_mockModule("stripe", () => ({
  default: jest.fn().mockImplementation(() => ({})),
}));

let poolRouter: unknown;
let requireAuth: jest.Mock;

beforeAll(async () => {
  poolRouter = (await import("../src/routes/pool.js")).default;
  const auth = await import("../src/middlewares/auth.js");
  requireAuth = auth.requireAuth;
});

beforeEach(() => {
  jest.clearAllMocks();
  awaitedQueryResults.length = 0;

  for (const method of ["select", "from", "where", "orderBy", "leftJoin"]) {
    mockDb[method].mockReturnThis();
  }
  mockDb.limit.mockResolvedValue([]);
  mockDb.execute.mockResolvedValue({ rows: [] });
  mockDb.then.mockImplementation((resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
    Promise.resolve(awaitedQueryResults.shift() ?? []).then(resolve, reject),
  );

  requireAuth.mockImplementation((req: { authenticatedUserId?: number }, _res: unknown, next: () => void) => {
    req.authenticatedUserId = 7;
    next();
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(poolRouter as express.Router);
  return app;
}

describe("GET /pool/my-stats", () => {
  it("requires authentication", async () => {
    requireAuth.mockImplementationOnce((_req: unknown, res: express.Response) => {
      res.status(401).json({ error: "Unauthorized" });
    });

    const response = await request(makeApp()).get("/pool/my-stats");

    expect(response.status).toBe(401);
  });

  it("returns 404 when the member is not assigned to a community", async () => {
    mockDb.limit.mockResolvedValueOnce([{ community_id: null }]);

    const response = await request(makeApp()).get("/pool/my-stats");

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not assigned/i);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("returns stats and scopes the aggregate to the member community", async () => {
    mockDb.limit.mockResolvedValueOnce([{ community_id: 42 }]);
    mockDb.execute.mockResolvedValueOnce({ rows: [{ name: "Southside" }] });
    awaitedQueryResults.push([{
      balance: 125,
      total_contributed: 200,
      total_fronted: 100,
      total_repaid: 25,
      sponsor_count: 3,
    }]);

    const response = await request(makeApp()).get("/pool/my-stats");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      community_id: 42,
      community_name: "Southside",
      balance: 125,
      total_contributed: 200,
      total_fronted: 100,
      total_repaid: 25,
      sponsor_count: 3,
    });
    expect(mockDb.where).toHaveBeenCalledWith({
      _eq: [poolColumns.community_id, 42],
    });
  });
});

describe("GET /pool/my-ledger", () => {
  it("returns only the assigned community's recent entries", async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ community_id: 42 }])
      .mockResolvedValueOnce([
        { id: 1, entry_type: "sponsor_contribution", amount: 50, notes: "Thanks", created_at: "2026-08-30" },
      ]);

    const response = await request(makeApp()).get("/pool/my-ledger?limit=100");

    expect(response.status).toBe(200);
    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0]).toMatchObject({
      id: 1,
      entry_type: "sponsor_contribution",
      amount: 50,
    });
    expect(mockDb.where).toHaveBeenCalledWith({
      _eq: [poolColumns.community_id, 42],
    });
    expect(mockDb.limit).toHaveBeenLastCalledWith(50);
  });

  it("returns an empty ledger for an unassigned member", async () => {
    mockDb.limit.mockResolvedValueOnce([{ community_id: null }]);

    const response = await request(makeApp()).get("/pool/my-ledger");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entries: [] });
    expect(mockDb.limit).toHaveBeenCalledTimes(1);
  });
});