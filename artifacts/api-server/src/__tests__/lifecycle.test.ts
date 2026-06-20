/**
 * Request lifecycle authorization tests.
 *
 * These tests verify that all lifecycle endpoints:
 *   - Require authentication (401 when no token)
 *   - Enforce ownership (403 when wrong user)
 *   - Accept the correct user (200/201 when authorized)
 *
 * DB interactions are mocked so no real Postgres connection is needed.
 */
import request from "supertest";
import express, { Express } from "express";
import { signTokenById } from "../middlewares/auth.js";

// ── Minimal DB mock ───────────────────────────────────────────────────────────
// We mock @workspace/db so no real DB connection is needed in unit tests.
jest.mock("@workspace/db", () => {
  const OPEN_REQUEST = {
    id: 1,
    title: "Test Request",
    status: "open",
    helper_id: null,
    requester_id: 10,
    payment_type: "goodwill",
    category: "errands",
    pay_it_forward_amount: null,
    pledge_paid: 0,
    lat: 32.7,
    lng: -97.3,
    neighborhood: null,
    created_at: new Date().toISOString(),
    claimed_at: null,
    en_route_at: null,
    arrived_at: null,
    completed_at: null,
  };

  const CLAIMED_REQUEST = {
    ...OPEN_REQUEST,
    id: 2,
    status: "claimed",
    helper_id: 20,
  };

  const COMPLETED_REQUEST = {
    ...OPEN_REQUEST,
    id: 3,
    status: "completed",
    helper_id: 20,
    requester_id: 10,
    completed_at: new Date().toISOString(),
  };

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
    groupBy: jest.fn().mockReturnValue([]),
    catch: jest.fn().mockResolvedValue([null]),
  };

  // Configure the request-specific returns
  (mockDb.limit as jest.Mock).mockImplementation(function(this: unknown) {
    return Promise.resolve([]);
  });
  (mockDb.returning as jest.Mock).mockImplementation(() => Promise.resolve([]));

  return {
    db: mockDb,
    requestsTable: { id: "id", status: "status", helper_id: "helper_id", requester_id: "requester_id" },
    usersTable: { id: "id", name: "name", email: "email", help_count: "help_count", trust_score: "trust_score", goodwill_score: "goodwill_score", benevolence_wallet: "benevolence_wallet", helper_mode_active: "helper_mode_active" },
    transactionsTable: { id: "id" },
    stripeAccountsTable: { id: "id", user_id: "user_id", payouts_enabled: "payouts_enabled", stripe_account_id: "stripe_account_id" },
    paymentTransactionsTable: { id: "id" },
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
  broadcastRequestEvent: jest.fn(),
}));

jest.mock("../lib/queue.js", () => ({
  enqueuePayoutRetry: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./push.js", () => ({
  sendPushToNearbyHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToAllHelpers: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./leaderboard.js", () => ({
  broadcastLeaderboardUpdate: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/mailer.js", () => ({
  sendReceipt: jest.fn().mockResolvedValue(undefined),
}));

// ── App setup ─────────────────────────────────────────────────────────────────
let app: Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { default: requestsRouter } = await import("../routes/requests.js");
  app.use("/api", requestsRouter);
});

// ── Helper: create a valid auth token for a user ──────────────────────────────
function bearerToken(userId: number): string {
  return `Bearer ${signTokenById(userId)}`;
}

// ── Reset mocks between tests to avoid state bleed ───────────────────────────
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/requests/:id/claim", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/1/claim").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 when requester tries to claim own request", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([{ requester_id: 10 }]);
    const res = await request(app)
      .post("/api/requests/1/claim")
      .set("Authorization", bearerToken(10))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own request/i);
  });

  it("returns 200 when a different user claims an open request", async () => {
    const { db } = await import("@workspace/db");
    const openReq = { id: 1, status: "open", requester_id: 10, helper_id: null };
    const claimedReq = { ...openReq, status: "claimed", helper_id: 20 };
    (db.limit as jest.Mock).mockResolvedValueOnce([openReq]);
    (db.returning as jest.Mock).mockResolvedValueOnce([claimedReq]);
    (db.limit as jest.Mock).mockResolvedValueOnce([{ id: 20, name: "Helper", lat: null, lng: null }]);
    const res = await request(app)
      .post("/api/requests/1/claim")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("claimed");
    expect(res.body.helper_id).toBe(20);
  });
});

describe("POST /api/requests/:id/en-route", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/2/en-route").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 when a different user tries to mark en-route", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([{ helper_id: 20 }]);
    const res = await request(app)
      .post("/api/requests/2/en-route")
      .set("Authorization", bearerToken(99))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not the assigned helper/i);
  });

  it("returns 200 when the assigned helper marks en-route", async () => {
    const { db } = await import("@workspace/db");
    const updatedReq = { id: 2, status: "en_route", helper_id: 20, requester_id: 10 };
    (db.limit as jest.Mock).mockResolvedValueOnce([{ helper_id: 20 }]);
    (db.returning as jest.Mock).mockResolvedValueOnce([updatedReq]);
    const res = await request(app)
      .post("/api/requests/2/en-route")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("en_route");
  });
});

describe("POST /api/requests/:id/arrived", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/2/arrived").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 when a different user tries to mark arrived", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([{ helper_id: 20 }]);
    const res = await request(app)
      .post("/api/requests/2/arrived")
      .set("Authorization", bearerToken(99))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not the assigned helper/i);
  });

  it("returns 200 when the assigned helper marks arrived", async () => {
    const { db } = await import("@workspace/db");
    const updatedReq = { id: 2, status: "arrived", helper_id: 20, requester_id: 10 };
    (db.limit as jest.Mock).mockResolvedValueOnce([{ helper_id: 20 }]);
    (db.returning as jest.Mock).mockResolvedValueOnce([updatedReq]);
    const res = await request(app)
      .post("/api/requests/2/arrived")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("arrived");
  });
});

describe("POST /api/requests/:id/complete", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/2/complete").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 when a non-helper tries to complete a request", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([{ helper_id: 20, status: "claimed" }]);
    const res = await request(app)
      .post("/api/requests/2/complete")
      .set("Authorization", bearerToken(99))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not the assigned helper/i);
  });

  it("returns 409 if request is already completed", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([{ helper_id: 20, status: "completed" }]);
    const res = await request(app)
      .post("/api/requests/2/complete")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already completed/i);
  });

  it("returns 200 when the assigned helper completes an active request", async () => {
    const { db } = await import("@workspace/db");
    const activeReq = { id: 2, status: "arrived", helper_id: 20, requester_id: 10, payment_type: "goodwill" };
    const completedReq = { ...activeReq, status: "completed" };
    (db.limit as jest.Mock).mockResolvedValueOnce([activeReq]);
    (db.returning as jest.Mock).mockResolvedValueOnce([completedReq]);
    (db.returning as jest.Mock).mockResolvedValueOnce([{ id: 20, help_count: 1, goodwill_score: 10 }]);
    const res = await request(app)
      .post("/api/requests/2/complete")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });
});

describe("POST /api/requests/:id/tip", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/3/tip").send({ tip_amount: 5 });
    expect(res.status).toBe(401);
  });

  it("returns 400 when tip_amount is missing", async () => {
    const res = await request(app)
      .post("/api/requests/3/tip")
      .set("Authorization", bearerToken(10))
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 403 when a non-requester tries to tip", async () => {
    const { db } = await import("@workspace/db");
    (db.limit as jest.Mock).mockResolvedValueOnce([{ id: 3, status: "completed", helper_id: 20, requester_id: 10 }]);
    const res = await request(app)
      .post("/api/requests/3/tip")
      .set("Authorization", bearerToken(99))
      .send({ tip_amount: 5 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only the requester/i);
  });

  it("returns 200 when the requester tips the helper", async () => {
    const { db } = await import("@workspace/db");
    const completedReq = {
      id: 3, status: "completed", helper_id: 20, requester_id: 10,
      payment_type: "goodwill", title: "Grocery run",
    };
    (db.limit as jest.Mock).mockResolvedValueOnce([completedReq]);
    (db.returning as jest.Mock).mockResolvedValueOnce([{ ...completedReq }]);
    (db.returning as jest.Mock).mockResolvedValueOnce([{ id: 20, benevolence_wallet: 5 }]);
    const res = await request(app)
      .post("/api/requests/3/tip")
      .set("Authorization", bearerToken(10))
      .send({ tip_amount: 5 });
    expect(res.status).toBe(200);
  });
});
