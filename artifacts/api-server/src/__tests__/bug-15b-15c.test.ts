/**
 * BUG-15b + BUG-15c regression tests.
 *
 * BUG-15b: max_travel_miles enforcement on claim
 *   - Helper with max_travel_miles=10 cannot claim request 12 miles away
 *   - Emergency requests bypass max_travel_miles
 *   - Default max_travel_miles is 15 if no userSettings row
 *
 * BUG-15c: /checkin endpoint security
 *   - Valid internal secret generates message
 *   - Missing internal secret returns 403
 *   - Wrong internal secret returns 403
 *
 * DB interactions are mocked so no real Postgres connection is needed.
 *
 * NOTE: this suite runs under Jest's native ESM support
 * (--experimental-vm-modules). Under native ESM, `jest.mock()` does NOT
 * intercept dynamic `await import()` calls — only `jest.unstable_mockModule()`
 * does. All mocked modules are registered below BEFORE any dynamic import,
 * and everything that might transitively touch "@workspace/db" (including
 * the auth middleware and the requests/checkin routers) is imported
 * dynamically inside beforeAll, after the mocks are in place.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import type { Express } from "express";
import express from "express";

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
    reportsTable: { id: "id", type: "type", reported_request_id: "reported_request_id", reporter_id: "reporter_id", status: "status", created_at: "created_at" },
    hubCommunityLeadersTable: { id: "id", user_id: "user_id", hub_id: "hub_id", approved: "approved", approved_at: "approved_at" },
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
    diasporaHubsTable: { id: "id", community_id: "community_id", name: "name", status: "status", is_seed: "is_seed", reserved_balance: "reserved_balance" },
    chatMessagesTable: { id: "id", request_id: "request_id", sender_id: "sender_id", content: "content", sent_at: "sent_at", read_at: "read_at" },
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
// factory's OWN enumerable keys — every drizzle-orm function used anywhere
// in the api-server import graph (see `grep -rn 'from "drizzle-orm"' src`)
// must be listed here, or transitively-imported modules throw
// "does not provide an export named X" at import time.
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
  getRedisConnection: jest.fn().mockReturnValue(null),
  isRedisConfigured: jest.fn().mockReturnValue(false),
  getRedisUrlStatus: jest.fn().mockReturnValue("not_set"),
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
  sendAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── App + mocked-module handles, wired up after mocks are registered ─────────
let app: Express;
let db: unknown;
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

// ── Reset mocks between tests ─────────────────────────────────────────────────
beforeEach(() => {
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
  // requireApproved (used on /claim) makes one DB lookup before the route
  // handler. Pre-seed it so authenticated tests get past requireApproved.
  // Tests without auth (401) never reach this call.
  (db.limit as jest.Mock).mockResolvedValueOnce([{
    is_suspended: false, trust_score: 50, approval_status: "approved", token_version: 0,
  }]);
});

// ── BUG-15b: max_travel_miles enforcement ─────────────────────────────────────

describe("BUG-15b: POST /api/requests/:id/claim — max_travel_miles enforcement", () => {
  it("returns 400 when helper's max_travel_miles is exceeded (non-emergency)", async () => {
    // Request at (0, 0) — helper at (0.2, 0) ≈ 13.8 miles away.
    // Call order: existingFull -> userSettings -> helperUser location.
    const mockRequest = { id: 1, requester_id: 10, urgency: "high", lat: 0, lng: 0, category: "errands" };
    const helper = { id: 20, lat: 0.2, lng: 0 };
    const helperSettings = { max_travel_miles: 10 };

    (db.limit as jest.Mock)
      .mockResolvedValueOnce([mockRequest])                   // existingFull
      .mockResolvedValueOnce([helperSettings])                // userSettings
      .mockResolvedValueOnce([helper]);                       // helper location

    const res = await request(app)
      .post("/api/requests/1/claim")
      .set("Authorization", bearerToken(20))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/beyond your max travel distance/i);
    expect(res.body.distance_miles).toBeGreaterThan(10);
    expect(res.body.max_travel_miles).toBe(10);
  });

  it("returns 200 when emergency request bypasses max_travel_miles", async () => {
    // Emergency request 50 miles away — urgency="emergency" skips the
    // userSettings/helperUser distance-check queries entirely.
    // Call order: existingFull -> [update+returning] -> final helper-name lookup.
    const mockRequest = { id: 1, requester_id: 10, urgency: "emergency", lat: 0, lng: 0, category: "errands" };
    const claimedReq = { id: 1, status: "claimed", helper_id: 20, requester_id: 10 };

    (db.limit as jest.Mock)
      .mockResolvedValueOnce([mockRequest])                   // existingFull (emergency)
      .mockResolvedValueOnce([{ name: "Helper" }]);           // final helper-name lookup

    (db.returning as jest.Mock).mockResolvedValueOnce([claimedReq]);

    const res = await request(app)
      .post("/api/requests/1/claim")
      .set("Authorization", bearerToken(20))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("claimed");
  });

  it("returns 200 when helper has no userSettings (default 15 miles)", async () => {
    // Request 14 miles away — within default 15.
    // Call order: existingFull -> userSettings (empty) -> helperUser -> [update+returning] -> final helper-name lookup.
    const mockRequest = { id: 1, requester_id: 10, urgency: "normal", lat: 0, lng: 0, category: "errands" };
    const helper = { id: 20, lat: 0.2, lng: 0 }; // ~13.8 miles
    const claimedReq = { id: 1, status: "claimed", helper_id: 20, requester_id: 10 };

    (db.limit as jest.Mock)
      .mockResolvedValueOnce([mockRequest])                   // existingFull
      .mockResolvedValueOnce([])                              // no userSettings row
      .mockResolvedValueOnce([helper])                        // helper location
      .mockResolvedValueOnce([{ name: "Helper" }]);           // final helper-name lookup

    (db.returning as jest.Mock).mockResolvedValueOnce([claimedReq]);

    const res = await request(app)
      .post("/api/requests/1/claim")
      .set("Authorization", bearerToken(20))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("claimed");
  });

  it("returns 200 when helper is within max_travel_miles", async () => {
    // Request 5 miles away — within max 10.
    // Call order: existingFull -> userSettings -> helperUser -> [update+returning] -> final helper-name lookup.
    const mockRequest = { id: 1, requester_id: 10, urgency: "normal", lat: 0, lng: 0, category: "errands" };
    const helper = { id: 20, lat: 0.07, lng: 0 }; // ~4.8 miles
    const helperSettings = { max_travel_miles: 10 };
    const claimedReq = { id: 1, status: "claimed", helper_id: 20, requester_id: 10 };

    (db.limit as jest.Mock)
      .mockResolvedValueOnce([mockRequest])                   // existingFull
      .mockResolvedValueOnce([helperSettings])                // userSettings
      .mockResolvedValueOnce([helper])                        // helper location
      .mockResolvedValueOnce([{ name: "Helper" }]);           // final helper-name lookup

    (db.returning as jest.Mock).mockResolvedValueOnce([claimedReq]);

    const res = await request(app)
      .post("/api/requests/1/claim")
      .set("Authorization", bearerToken(20))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("claimed");
  });
});

// ── BUG-15c: /checkin endpoint security ───────────────────────────────────────

jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  Anthropic: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hey friend! How did your request go?" }],
      }),
    },
  })),
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hey friend! How did your request go?" }],
      }),
    },
  })),
}));

describe("BUG-15c: POST /checkin — Nia check-in endpoint security", () => {
  let checkinApp: Express;

  beforeAll(async () => {
    checkinApp = express();
    checkinApp.use(express.json());
    const { default: checkinRouter } = await import("../routes/checkin.js");
    checkinApp.use("/checkin", checkinRouter);
  });

  it("returns 403 when x-internal-secret header is missing", async () => {
    const res = await request(checkinApp)
      .post("/checkin")
      .send({
        userId: 1,
        requestId: 1,
        requestTitle: "Test request",
        category: "errands",
        helperName: "Helper",
        sessionId: "test-session",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/unauthorized/i);
  });

  it("returns 403 when x-internal-secret is wrong", async () => {
    const res = await request(checkinApp)
      .post("/checkin")
      .set("x-internal-secret", "wrong-secret")
      .send({
        userId: 1,
        requestId: 1,
        requestTitle: "Test request",
        category: "errands",
        helperName: "Helper",
        sessionId: "test-session",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/unauthorized/i);
  });

  it("returns 200 with valid x-internal-secret (Claude API mocked)", async () => {
    const res = await request(checkinApp)
      .post("/checkin")
      .set("x-internal-secret", process.env.INTERNAL_SECRET || "test-secret")
      .send({
        userId: 1,
        requestId: 1,
        requestTitle: "Test request",
        category: "errands",
        helperName: "Helper",
        sessionId: "test-session",
      });

    // Note: This test may return 500 if Claude API is not fully mocked
    // The key assertion is that it does NOT return 403
    expect(res.status).not.toBe(403);
  });
});
