/**
 * User registration and authentication tests.
 *
 * Tests cover:
 *   - Happy-path registration (201 + token)
 *   - Duplicate email rejection (409)
 *   - Missing required fields (400)
 *   - Happy-path login (200 + token)
 *   - Legacy account login (403 LEGACY_PASSWORD_REQUIRED, no token issued)
 *   - Wrong password / unknown email (401)
 *   - Business/sponsor registration keeps pending approval + org name (BUG-CRIT-03)
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

  // Regression tests for BUG-CRIT-03: account_type "business" / "sponsor"
  // (the two options login.tsx's registration UI actually offers alongside
  // "individual") were being silently downgraded to "individual" because the
  // server-side allowlist only recognized "individual" and "organization".
  // That skipped admin review entirely and dropped organization_name.
  it.each(["business", "sponsor"])(
    "stores account_type '%s' as-is and requires admin approval",
    async (accountType) => {
      const { db } = await import("@workspace/db");
      (db.limit as jest.Mock).mockResolvedValueOnce([]); // no existing user
      (db.returning as jest.Mock).mockResolvedValueOnce([{
        id: 99, name: "Acme Helpers", email: `${accountType}@example.com`,
        is_helper: false, trust_score: 50, help_count: 0, benevolence_wallet: 0,
        password_hash: "$2a$12$fakehashedvalue",
        account_type: accountType,
        organization_name: "Acme Org",
        approval_status: "pending",
      }]);

      const res = await request(app)
        .post("/api/users/register")
        .send({
          name: "Acme Helpers",
          email: `${accountType}@example.com`,
          password: "securePass1",
          account_type: accountType,
          organization_name: "Acme Org",
        });

      expect(res.status).toBe(201);
      // Assert what was actually handed to db.insert(...).values(...)
      const insertedValues = (db.values as jest.Mock).mock.calls.at(-1)?.[0];
      expect(insertedValues.account_type).toBe(accountType);
      expect(insertedValues.approval_status).toBe("pending");
      expect(insertedValues.organization_name).toBe("Acme Org");
    }
  );

  it("auto-approves individual accounts and leaves organization_name null", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([]);
    (db.returning as jest.Mock).mockResolvedValueOnce([{
      id: 100, name: "Jane Doe", email: "jane@example.com",
      is_helper: false, trust_score: 50, help_count: 0, benevolence_wallet: 0,
      password_hash: "$2a$12$fakehashedvalue",
      account_type: "individual", approval_status: "approved",
    }]);

    const res = await request(app)
      .post("/api/users/register")
      .send({ name: "Jane Doe", email: "jane@example.com", password: "securePass1" });

    expect(res.status).toBe(201);
    const insertedValues = (db.values as jest.Mock).mock.calls.at(-1)?.[0];
    expect(insertedValues.account_type).toBe("individual");
    expect(insertedValues.approval_status).toBe("approved");
    expect(insertedValues.organization_name).toBeNull();
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

  it("returns 403 LEGACY_PASSWORD_REQUIRED for accounts with no password_hash set", async () => {
    const { db } = await import("@workspace/db");
    // Legacy account — no password_hash
    (db.limit as jest.Mock).mockResolvedValueOnce([{
      id: 5, name: "Legacy", email: "legacy@example.com",
      password_hash: null, is_helper: false,
    }]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "legacy@example.com", password: "anything" });

    // A legacy account (created before password auth existed) must never be
    // logged straight in on an unverified password — it's routed to the
    // password-setup flow instead (see routes/users.ts LEGACY_PASSWORD_REQUIRED
    // and the /users/request-password-reset + /users/set-initial-password pair).
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("LEGACY_PASSWORD_REQUIRED");
    expect(res.body.user_id).toBe(5);
    expect(res.body.token).toBeUndefined();
  });
});
