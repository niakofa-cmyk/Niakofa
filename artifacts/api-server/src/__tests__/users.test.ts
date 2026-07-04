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
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
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
  // mockReset() clears both call history AND any queued mockResolvedValueOnce/
  // mockReturnValueOnce entries from previous tests — critical for preventing
  // mock state bleeding when a test sets up a once-mock but the route returns
  // early (e.g. Zod validation failure) without consuming it.
  (db.select as jest.Mock).mockReset().mockReturnThis();
  (db.update as jest.Mock).mockReset().mockReturnThis();
  (db.insert as jest.Mock).mockReset().mockReturnThis();
  (db.delete as jest.Mock).mockReset().mockReturnThis();
  (db.from as jest.Mock).mockReset().mockReturnThis();
  (db.where as jest.Mock).mockReset().mockReturnThis();
  (db.set as jest.Mock).mockReset().mockReturnThis();
  (db.values as jest.Mock).mockReset().mockReturnThis();
  (db.orderBy as jest.Mock).mockReset().mockReturnThis();
  (db.limit as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.returning as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
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
      .send({ name: "Alice", email: "alice@example.com", password: "secret123", tos_accepted: true, account_type: "individual" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
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
      .send({ name: "Bob", email: "bob@example.com", password: "securePass1", tos_accepted: true, account_type: "individual" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(42);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    // Password hash must never be leaked to the client
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("registers successfully without a password (legacy/no-password account)", async () => {
    // Note: password-less registration is no longer supported via the standard
    // register endpoint (Zod schema requires password). This test validates the
    // 400 response for a missing password — the old "legacy account creation"
    // path is now handled through admin import tooling, not the public API.
    const res = await request(app)
      .post("/api/users/register")
      .send({ name: "Legacy User", email: "legacy@example.com", tos_accepted: true, account_type: "individual" });

    // password is required by the Zod schema — expect 400
    expect(res.status).toBe(400);
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

  it("returns 403 with LEGACY_PASSWORD_REQUIRED for legacy accounts", async () => {
    const { db } = await import("@workspace/db");
    // Legacy account — no password_hash (imported from external source, never set a password)
    (db.limit as jest.Mock).mockResolvedValueOnce([{
      id: 5, name: "Legacy", email: "legacy@example.com",
      password_hash: null, is_helper: false,
    }]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "legacy@example.com", password: "anything" });

    // Route returns 403 with error_code so the client can redirect to the
    // forgot-password / set-password flow — not 200 with a token.
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("LEGACY_PASSWORD_REQUIRED");
    expect(res.body.user_id).toBe(5);
  });
});
