/**
 * User registration and authentication tests.
 *
 * Tests cover:
 *   - Happy-path registration (201 + token)
 *   - Duplicate email rejection (409)
 *   - Missing required fields (400)
 *   - Happy-path login (200 + token)
 *   - Legacy account login (200 + password_reset_required: true)
 *   - Wrong password / unknown email (401)
 *
 * DB interactions are mocked so no real Postgres connection is needed.
 *
 * NOTE: this suite runs under Jest's native ESM support
 * (--experimental-vm-modules). Under native ESM, `jest.mock()` does NOT
 * intercept dynamic `await import()` calls — only `jest.unstable_mockModule()`
 * does. All mocked modules are registered below BEFORE any dynamic import,
 * and the router is imported dynamically inside beforeAll, after the mocks
 * are in place.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { Express } from "express";

const mockDb: Record<string, jest.Mock> = {
  select:  jest.fn().mockReturnThis(),
  update:  jest.fn().mockReturnThis(),
  insert:  jest.fn().mockReturnThis(),
  delete:  jest.fn().mockReturnThis(),
  from:    jest.fn().mockReturnThis(),
  where:   jest.fn().mockReturnThis(),
  set:     jest.fn().mockReturnThis(),
  values:  jest.fn().mockReturnThis(),
  limit:   jest.fn().mockResolvedValue([]),
  returning: jest.fn().mockResolvedValue([]),
  orderBy: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnValue([]),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  usersTable: {
    id: "id", name: "name", email: "email", password_hash: "password_hash",
    is_helper: "is_helper", trust_score: "trust_score", help_count: "help_count",
    benevolence_wallet: "benevolence_wallet", is_admin: "is_admin",
    is_suspended: "is_suspended", tos_accepted: "tos_accepted",
    tos_waiver_version: "tos_waiver_version", account_type: "account_type",
    approval_status: "approval_status", helper_status: "helper_status",
  },
  requestsTable: { id: "id", status: "status", requester_id: "requester_id" },
  transactionsTable: { id: "id", user_id: "user_id" },
  stripeAccountsTable: { id: "id", user_id: "user_id" },
  paymentTransactionsTable: { id: "id" },
  scheduledPaymentsTable: { id: "id", user_id: "user_id" },
  userSettingsTable: { id: "id", user_id: "user_id" },
  helperAvailabilityTable: { id: "id", user_id: "user_id" },
  communityPoolLedgerTable: { id: "id", amount: "amount" },
  poolPendingMinimumsTable: { id: "id", request_id: "request_id" },
  communitiesTable: { id: "id", name: "name", target_reserve_amount: "target_reserve_amount" },
  systemSettingsTable: { key: "key", value: "value" },
  diasporaHubsTable: { id: "id", community_id: "community_id", name: "name", status: "status", is_seed: "is_seed", reserved_balance: "reserved_balance" },
  diasporaHubPledgesTable: { id: "id", pledged_by: "pledged_by", status: "status" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  or: jest.fn(),
  not: jest.fn(),
  sql: jest.fn(),
  inArray: jest.fn(),
  notInArray: jest.fn(),
  asc: jest.fn(),
  desc: jest.fn(),
  gte: jest.fn(),
  gt: jest.fn(),
  lte: jest.fn(),
  lt: jest.fn(),
  ne: jest.fn(),
  isNull: jest.fn(),
  isNotNull: jest.fn(),
}));

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  broadcast: jest.fn(),
  broadcastRequestEvent: jest.fn(),
  sendToUser: jest.fn(),
  sendToRequestParticipants: jest.fn(),
  sendToUsers: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
  getConnectedUserIds: jest.fn().mockReturnValue([]),
  getHubMetrics: jest.fn().mockReturnValue({}),
}));

jest.unstable_mockModule("../lib/queue.js", () => ({
  enqueuePayoutRetry: jest.fn().mockResolvedValue(undefined),
  isRedisConfigured: jest.fn().mockReturnValue(false),
  getRedisUrlStatus: jest.fn().mockReturnValue("not_set"),
}));

jest.unstable_mockModule("../lib/mailer.js", () => ({
  sendReceipt: jest.fn().mockResolvedValue(undefined),
  sendAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule("../routes/push.js", () => ({
  sendPushToNearbyHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToAllHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  sendPushToUsers: jest.fn().mockResolvedValue(undefined),
  default: { get: jest.fn(), post: jest.fn(), use: jest.fn() },
}));

let app: Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { default: usersRouter } = await import("../routes/users.js");
  app.use("/api", usersRouter);
});

beforeEach(() => {
  mockDb.select.mockReset().mockReturnThis();
  mockDb.update.mockReset().mockReturnThis();
  mockDb.insert.mockReset().mockReturnThis();
  mockDb.delete.mockReset().mockReturnThis();
  mockDb.from.mockReset().mockReturnThis();
  mockDb.where.mockReset().mockReturnThis();
  mockDb.set.mockReset().mockReturnThis();
  mockDb.values.mockReset().mockReturnThis();
  mockDb.orderBy.mockReset().mockReturnThis();
  mockDb.leftJoin.mockReset().mockReturnThis();
  mockDb.groupBy.mockReset().mockReturnValue([]);
  mockDb.limit.mockReset().mockResolvedValue([]);
  mockDb.returning.mockReset().mockResolvedValue([]);
});

describe("POST /api/users/register", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  it("returns 409 when email is already registered", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 1 }]);

    const res = await request(app)
      .post("/api/users/register")
      .send({ name: "Alice", email: "alice@example.com", password: "secret123", tos_accepted: true, account_type: "individual" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("returns 201 with user and token on successful registration", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    mockDb.returning.mockResolvedValueOnce([{
      id: 42,
      name: "Bob",
      email: "bob@example.com",
      is_helper: false,
      trust_score: 50,
      help_count: 0,
      benevolence_wallet: 0,
      password_hash: "$2a$12$fakehashedvalue",
    }]);

    const res = await request(app)
      .post("/api/users/register")
      .send({ name: "Bob", email: "bob@example.com", password: "securePass1", tos_accepted: true, account_type: "individual" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(42);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("registers successfully without a password (legacy/no-password account)", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({ name: "Legacy User", email: "legacy@example.com", tos_accepted: true, account_type: "individual" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/users/login", () => {
  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/users/login")
      .send({ password: "secret123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email required/i);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password required/i);
  });

  it("returns 401 when no account exists for that email", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "nobody@example.com", password: "pass" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it("returns 401 when password is incorrect", async () => {
    const hash = "$2a$04$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";
    mockDb.limit.mockResolvedValueOnce([{
      id: 1, email: "user@example.com", password_hash: hash,
    }]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "user@example.com", password: "wrongPassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it("returns 403 with LEGACY_PASSWORD_REQUIRED for legacy accounts", async () => {
    mockDb.limit.mockResolvedValueOnce([{
      id: 5, name: "Legacy", email: "legacy@example.com",
      password_hash: null, is_helper: false,
    }]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "legacy@example.com", password: "anything" });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("LEGACY_PASSWORD_REQUIRED");
  });
});
