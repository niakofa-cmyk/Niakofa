/**
 * Request lifecycle authorization tests.
 *
 * These tests verify that all lifecycle endpoints:
 *   - Require authentication (401 when no token)
 *   - Enforce ownership (403 when wrong user)
 *   - Accept the correct user (200/201 when authorized)
 *
 * DB interactions are mocked so no real Postgres connection is needed.
 *
 * NOTE: this suite runs under Jest's native ESM support
 * (--experimental-vm-modules). Under native ESM, `jest.mock()` does NOT
 * intercept dynamic `await import()` calls — only `jest.unstable_mockModule()`
 * does. All mocked modules are registered below BEFORE any dynamic import,
 * and everything that might transitively touch "@workspace/db" (including
 * the auth middleware and the requests router) is imported dynamically
 * inside beforeAll, after the mocks are in place.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { Express } from "express";

// ── Minimal DB mock ───────────────────────────────────────────────────────────
jest.unstable_mockModule("@workspace/db", () => {
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

  (mockDb.limit as jest.Mock).mockImplementation(() => Promise.resolve([]));
  (mockDb.returning as jest.Mock).mockImplementation(() => Promise.resolve([]));

  return {
    db: mockDb,
    // NOTE: this list must mirror EVERY table symbol requests.ts (and
    // anything it transitively imports, e.g. lib/community-pool.ts) pulls
    // from "@workspace/db" — under native ESM, a missing key here throws
    // "does not provide an export named X" at import time, not at use time.
    requestsTable: { id: "id", status: "status", helper_id: "helper_id", requester_id: "requester_id", lat: "lat", lng: "lng", urgency: "urgency", category: "category" },
    usersTable: { id: "id", name: "name", email: "email", help_count: "help_count", trust_score: "trust_score", goodwill_score: "goodwill_score", benevolence_wallet: "benevolence_wallet", helper_mode_active: "helper_mode_active", lat: "lat", lng: "lng" },
    userSettingsTable: { id: "id", user_id: "user_id", max_travel_miles: "max_travel_miles" },
    transactionsTable: { id: "id" },
    stripeAccountsTable: { id: "id", user_id: "user_id", payouts_enabled: "payouts_enabled", stripe_account_id: "stripe_account_id" },
    paymentTransactionsTable: { id: "id" },
    requestHelpersTable: { id: "id", request_id: "request_id", helper_id: "helper_id" },
    helperAvailabilityTable: { id: "id", user_id: "user_id" },
    businessesTable: { id: "id" },
    businessMembersTable: { id: "id", business_id: "business_id", user_id: "user_id" },
    systemSettingsTable: { key: "key", value: "value" },
    communityPoolLedgerTable: { id: "id", amount: "amount", request_id: "request_id", created_at: "created_at" },
    poolPendingMinimumsTable: { id: "id", request_id: "request_id" },
    communitiesTable: { id: "id", name: "name", target_reserve_amount: "target_reserve_amount", created_at: "created_at" },
    ratingsTable: { id: "id", request_id: "request_id", rater_id: "rater_id", ratee_id: "ratee_id", stars: "stars", role: "role" },
    paymentTransactionsTable: { id: "id", request_id: "request_id", state: "state" },
    scheduledPaymentsTable: { id: "id", user_id: "user_id" },
    walletCashoutsTable: { id: "id", user_id: "user_id" },
    transactionsTable: { id: "id", user_id: "user_id" },
  };
});

// NOTE: under native ESM, Jest builds a static synthetic module from the
// factory's OWN enumerable keys — a Proxy with no real keys would export
// nothing, breaking any transitively-imported module's named imports (e.g.
// community-pool.ts imports `asc`, which requests.ts pulls in indirectly).
// So every drizzle-orm function used anywhere in the api-server import
// graph (see `grep -rn 'from "drizzle-orm"' src`) must be listed here.
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
}));

jest.unstable_mockModule("../routes/push.js", () => ({
  sendPushToNearbyHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToAllHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  sendPushToUsers: jest.fn().mockResolvedValue(undefined),
  default: { get: jest.fn(), post: jest.fn(), use: jest.fn() },
}));

jest.unstable_mockModule("../routes/leaderboard.js", () => ({
  broadcastLeaderboardUpdate: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../lib/mailer.js", () => ({
  sendReceipt: jest.fn().mockResolvedValue(undefined),
}));

// ── App + mocked-module handles, wired up after mocks are registered ─────────
let app: Express;
let db: any;
let signTokenById: (id: number) => string;

beforeAll(async () => {
  ({ db } = await import("@workspace/db"));
  ({ signTokenById } = await import("../middlewares/auth.js"));
  const { parseAuth } = await import("../middlewares/auth.js");
  const { default: requestsRouter } = await import("../routes/requests.js");

  app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use("/api", requestsRouter);
});

// ── Helper: create a valid auth token for a user ──────────────────────────────
function bearerToken(userId: number): string {
  return `Bearer ${signTokenById(userId)}`;
}

// ── Reset mocks between tests to avoid state bleed ───────────────────────────
beforeEach(() => {
  (db.select as jest.Mock).mockClear().mockReturnThis();
  (db.update as jest.Mock).mockClear().mockReturnThis();
  (db.insert as jest.Mock).mockClear().mockReturnThis();
  (db.delete as jest.Mock).mockClear().mockReturnThis();
  (db.from as jest.Mock).mockClear().mockReturnThis();
  (db.where as jest.Mock).mockClear().mockReturnThis();
  (db.set as jest.Mock).mockClear().mockReturnThis();
  (db.values as jest.Mock).mockClear().mockReturnThis();
  // mockReset (not mockClear) is required here: mockClear only clears call
  // history, but leaves queued mockResolvedValueOnce values intact. Those
  // stale queued values bleed into the next test and shift the DB-response
  // queue by one, turning a 403 into a 409 (or vice-versa). mockReset wipes
  // both history AND all queued return-value overrides.
  (db.limit as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.returning as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  // requireApproved (used on claim/en-route/arrived/complete) makes one DB
  // lookup before each route handler runs. Pre-seed it here so every test
  // that sends a valid auth token gets past requireApproved automatically.
  // Tests without auth (401) never reach this DB call, so this is harmless.
  (db.limit as jest.Mock).mockResolvedValueOnce([{
    is_suspended: false, trust_score: 50, approval_status: "approved", token_version: 0,
  }]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/requests/:id/claim", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/1/claim").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 when requester tries to claim own request", async () => {
    // Single query: existingFull (lat/lng/urgency/category/requester_id).
    // requester_id === helperId (10) triggers the early 403 before any
    // further DB calls.
    (db.limit as jest.Mock).mockResolvedValueOnce([{ requester_id: 10, urgency: "normal", lat: null, lng: null, category: "errands" }]);
    const res = await request(app)
      .post("/api/requests/1/claim")
      .set("Authorization", bearerToken(10))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own request/i);
  });

  it("returns 200 when a different user claims an open request", async () => {
    // Call order: existingFull -> userSettings (none -> default 15mi) ->
    // helperUser (no lat/lng -> distance check skipped) -> [update+returning]
    // -> final helper-name lookup.
    const existingFull = { requester_id: 10, urgency: "normal", lat: null, lng: null, category: "errands" };
    const claimedReq = { id: 1, status: "claimed", helper_id: 20, requester_id: 10 };
    (db.limit as jest.Mock)
      .mockResolvedValueOnce([existingFull])
      .mockResolvedValueOnce([]) // no userSettings row
      .mockResolvedValueOnce([{ lat: null, lng: null }]) // helper has no location
      .mockResolvedValueOnce([{ name: "Helper" }]); // final helper-name lookup
    (db.returning as jest.Mock).mockResolvedValueOnce([claimedReq]);
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

  // NOTE: en-route uses a single atomic UPDATE ... WHERE id AND helper_id
  // AND status='claimed' guard (see requests.ts comment above the route) —
  // there is no separate ownership SELECT. A mismatched helper_id or wrong
  // status simply matches zero rows, so the response is 409 (not 403): the
  // request still exists, the caller just isn't the current assigned helper
  // in a state that allows this transition.
  it("returns 409 when a different user tries to mark en-route", async () => {
    const res = await request(app)
      .post("/api/requests/2/en-route")
      .set("Authorization", bearerToken(99))
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no longer the assigned helper/i);
  });

  it("returns 200 when the assigned helper marks en-route", async () => {
    const updatedReq = { id: 2, status: "en_route", helper_id: 20, requester_id: 10 };
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

  // Same atomic-UPDATE guard pattern as en-route above: mismatch -> 0 rows
  // updated -> 409, not 403.
  it("returns 409 when a different user tries to mark arrived", async () => {
    const res = await request(app)
      .post("/api/requests/2/arrived")
      .set("Authorization", bearerToken(99))
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not currently in en-route status/i);
  });

  it("returns 200 when the assigned helper marks arrived", async () => {
    const updatedReq = { id: 2, status: "arrived", helper_id: 20, requester_id: 10 };
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

  // Complete uses the same atomic UPDATE ... WHERE id AND helper_id AND
  // status NOT IN (completed, cancelled) guard — a wrong helper and an
  // already-completed request both simply match zero rows, so both cases
  // return the SAME 404 response (not 403/409 respectively).
  it("returns 404 when a non-helper tries to complete a request", async () => {
    const res = await request(app)
      .post("/api/requests/2/complete")
      .set("Authorization", bearerToken(99))
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not the assigned helper/i);
  });

  it("returns 404 if request is already completed", async () => {
    const res = await request(app)
      .post("/api/requests/2/complete")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/already completed/i);
  });

  it("returns 200 when the assigned helper completes an active request", async () => {
    const completedReq = { id: 2, status: "completed", helper_id: 20, requester_id: 10, payment_type: "goodwill", pay_it_forward_amount: 0, title: "Grocery run" };
    (db.returning as jest.Mock)
      .mockResolvedValueOnce([completedReq]) // the completion UPDATE
      .mockResolvedValueOnce([{ id: 20, help_count: 1, goodwill_score: 10 }]); // goodwill_score increment
    (db.limit as jest.Mock).mockResolvedValueOnce([{ help_count: 0, trust_score: 50, name: "Helper" }]); // helperBefore
    const res = await request(app)
      .post("/api/requests/2/complete")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });
});

// POST /requests/:id/tip is permanently retired (410 Gone) — see the
// comment block above the route in requests.ts. It used to credit an
// arbitrary client-supplied tip_amount straight to a helper's wallet with
// no Stripe verification, which was a money-security hole. It now always
// returns 410 regardless of auth, body, or ownership, so there's nothing
// left to test except that retirement is unconditional.
describe("POST /api/requests/:id/tip (retired)", () => {
  it("returns 410 Gone even with no Authorization header", async () => {
    const res = await request(app).post("/api/requests/3/tip").send({ tip_amount: 5 });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("endpoint_retired");
  });

  it("returns 410 Gone regardless of body contents", async () => {
    const res = await request(app)
      .post("/api/requests/3/tip")
      .set("Authorization", bearerToken(10))
      .send({});
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("endpoint_retired");
  });

  it("returns 410 Gone regardless of who calls it", async () => {
    const res = await request(app)
      .post("/api/requests/3/tip")
      .set("Authorization", bearerToken(99))
      .send({ tip_amount: 5 });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/retired/i);
  });
});
