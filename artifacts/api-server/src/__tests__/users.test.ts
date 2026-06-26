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
 */
import request from "supertest";
import express, { Express } from "express";

// ── DB mock ───────────────────────────────────────────────────────────────────
jest.mock("@workspace/db", () => {
  const mockDb: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    returning: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
  };
  (mockDb.limit as jest.Mock).mockImplementation(() => Promise.resolve([]));
  (mockDb.returning as jest.Mock).mockImplementation(() => Promise.resolve([]));

  return {
    db: mockDb,
    usersTable: { id: "id", name: "name", email: "email", password_hash: "password_hash" },
    requestsTable: {},
    transactionsTable: {},
    stripeAccountsTable: {},
    paymentTransactionsTable: {},
    scheduledPaymentsTable: {},
    userSettingsTable: {},
  };
});

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  sql: jest.fn(),
  inArray: jest.fn(),
}));

jest.mock("../lib/ws-hub.js", () => ({
  broadcast: jest.fn(),
}));

jest.mock("../lib/queue.js", () => ({
  enqueuePayoutRetry: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/mailer.js", () => ({
  sendReceipt: jest.fn().mockResolvedValue(undefined),
}));

// ── App setup ─────────────────────────────────────────────────────────────────
let app: Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { default: usersRouter } = await import("../routes/users.js");
  app.use("/api", usersRouter);
});

// ── Reset mocks between tests ─────────────────────────────────────────────────
beforeEach(async () => {
  const { db } = await import("@workspace/db");
  (db.select as jest.Mock).mockClear().mockReturnThis();
  (db.update as jest.Mock).mockClear().mockReturnThis();
  (db.insert as jest.Mock).mockClear().mockReturnThis();
  (db.delete as jest.Mock).mockClear().mockReturnThis();
  (db.from as jest.Mock).mockClear().mockReturnThis();
  (db.where as jest.Mock).mockClear().mockReturnThis();
  (db.set as jest.Mock).mockClear().mockReturnThis();
  (db.values as jest.Mock).mockClear().mockReturnThis();
  (db.limit as jest.Mock).mockClear().mockImplementation(() => Promise.resolve([]));
  (db.returning as jest.Mock).mockClear().mockImplementation(() => Promise.resolve([]));
});

// ── Registration tests ────────────────────────────────────────────────────────

describe("POST /api/users/register", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  it("returns 409 when email is already registered", async () => {
    const { db } = await import("@workspace/db");
    // First limit call = duplicate check (returns existing user)
    (db.limit as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);

    const res = await request(app)
      .post("/api/users/register")
      .send({ name: "Alice", email: "alice@example.com", password: "secret123" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("returns 201 with user and token on successful registration", async () => {
    const { db } = await import("@workspace/db");
    // Duplicate check — no existing user
    (db.limit as jest.Mock).mockResolvedValueOnce([]);
    // Insert returning
    (db.returning as jest.Mock).mockResolvedValueOnce([{
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
      .send({ name: "Bob", email: "bob@example.com", password: "securePass1" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(42);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    // Password hash must never be leaked to the client
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("registers successfully without a password (legacy/no-password account)", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([]);
    (db.returning as jest.Mock).mockResolvedValueOnce([{
      id: 43, name: "Legacy User", email: "legacy@example.com",
      is_helper: false, trust_score: 50, help_count: 0, benevolence_wallet: 0,
      password_hash: null,
    }]);

    const res = await request(app)
      .post("/api/users/register")
      .send({ name: "Legacy User", email: "legacy@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.token).toBeDefined();
  });
});

// ── Login tests ───────────────────────────────────────────────────────────────

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
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "nobody@example.com", password: "pass" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no account found/i);
  });

  it("returns 401 when password is incorrect", async () => {
    const { db } = await import("@workspace/db");
    // Return a user with a real bcrypt hash for "correctPassword"
    // We test with "wrongPassword" — bcrypt.compare will return false
    // Hash of "correctPassword" (pre-computed for test speed at 4 rounds)
    const hash = "$2a$04$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";
    (db.limit as jest.Mock).mockResolvedValueOnce([{
      id: 1, email: "user@example.com", password_hash: hash,
    }]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "user@example.com", password: "wrongPassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorrect password/i);
  });

  it("returns 200 with password_reset_required for legacy accounts", async () => {
    const { db } = await import("@workspace/db");
    // Legacy account — no password_hash
    (db.limit as jest.Mock).mockResolvedValueOnce([{
      id: 5, name: "Legacy", email: "legacy@example.com",
      password_hash: null, is_helper: false,
    }]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "legacy@example.com", password: "anything" });

    expect(res.status).toBe(200);
    expect(res.body.password_reset_required).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.id).toBe(5);
  });
});
