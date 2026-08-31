/**
 * Safety endpoint tests — safety-ping and safety-sos.
 *
 * Added after a forensic report caught a build-breaking bug in
 * POST /requests/:id/safety-ping (it tried to write a nonexistent
 * `updated_at` column on help_requests). That endpoint shipped with zero
 * test coverage, so `pnpm run typecheck` was the only thing that caught it —
 * these tests exist so a future change to help_requests (or to these routes)
 * fails loudly here instead of silently at build time.
 *
 * Same ESM mocking pattern as lifecycle.test.ts: jest.unstable_mockModule
 * before any dynamic import, native ESM only intercepts that (not
 * jest.mock()).
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import type { Express } from "express";
import express from "express";

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
    onConflictDoNothing: jest.fn().mockResolvedValue([]),
    onConflictDoUpdate: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)),
    then: jest.fn().mockImplementation((resolve: unknown, reject: unknown) =>
      Promise.resolve([]).then(resolve, reject)
    ),
    // Production code (safety-ping) does a fire-and-forget
    // db.update(...).set(...).where(...).catch(...) — real Drizzle query
    // builders are full thenables and support .catch() directly, but this
    // mock only exposed .then(), so that call threw "catch is not a
    // function" and turned a safe fire-and-forget write into a 500.
    catch: jest.fn().mockImplementation((reject: unknown) => Promise.resolve([]).catch(reject)),
    execute: jest.fn().mockResolvedValue({ rows: [] }),
  };
  (mockDb.limit as jest.Mock).mockImplementation(() => Promise.resolve([]));
  (mockDb.returning as jest.Mock).mockImplementation(() => Promise.resolve([]));

  return {
    db: mockDb,
    requestsTable: { id: "id", status: "status", helper_id: "helper_id", requester_id: "requester_id", lat: "lat", lng: "lng", urgency: "urgency", category: "category", title: "title" },
    reportsTable: { id: "id", type: "type", reported_request_id: "reported_request_id", reporter_id: "reporter_id", status: "status", created_at: "created_at" },
    hubCommunityLeadersTable: { id: "id", user_id: "user_id", hub_id: "hub_id", approved: "approved", approved_at: "approved_at" },
    usersTable: { id: "id", name: "name", email: "email", help_count: "help_count", trust_score: "trust_score", goodwill_score: "goodwill_score", benevolence_wallet: "benevolence_wallet", helper_mode_active: "helper_mode_active", lat: "lat", lng: "lng" },
    userSettingsTable: { id: "id", user_id: "user_id", max_travel_miles: "max_travel_miles" },
    transactionsTable: { id: "id", user_id: "user_id" },
    stripeAccountsTable: { id: "id", user_id: "user_id", payouts_enabled: "payouts_enabled", stripe_account_id: "stripe_account_id" },
    paymentTransactionsTable: { id: "id", request_id: "request_id", state: "state" },
    requestHelpersTable: { id: "id", request_id: "request_id", helper_id: "helper_id" },
    helperAvailabilityTable: { id: "id", user_id: "user_id" },
    businessesTable: { id: "id" },
    businessMembersTable: { id: "id", business_id: "business_id", user_id: "user_id" },
    systemSettingsTable: { key: "key", value: "value" },
    diasporaHubsTable: { id: "id", community_id: "community_id", name: "name", status: "status", is_seed: "is_seed", reserved_balance: "reserved_balance" },
    chatMessagesTable: { id: "id", request_id: "request_id", sender_id: "sender_id", content: "content", sent_at: "sent_at", read_at: "read_at" },
    communityPoolLedgerTable: { id: "id", amount: "amount", request_id: "request_id", created_at: "created_at" },
    communityPoolFinancialEventsTable: {},
    poolPendingMinimumsTable: { id: "id", request_id: "request_id" },
    communitiesTable: { id: "id", name: "name", target_reserve_amount: "target_reserve_amount", created_at: "created_at" },
    ratingsTable: { id: "id", request_id: "request_id", rater_id: "rater_id", ratee_id: "ratee_id", stars: "stars", role: "role" },
    scheduledPaymentsTable: { id: "id", user_id: "user_id" },
    walletCashoutsTable: { id: "id", user_id: "user_id" },
  };
});

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

const broadcastMock = jest.fn();
const sendToUserMock = jest.fn();

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  broadcast: broadcastMock,
  broadcastRequestEvent: jest.fn(),
  sendToUser: sendToUserMock,
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
}));

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

function bearerToken(userId: number): string {
  return `Bearer ${signTokenById(userId)}`;
}

beforeEach(() => {
  (db.select as jest.Mock).mockReset().mockReturnThis();
  (db.update as jest.Mock).mockReset().mockReturnThis();
  (db.insert as jest.Mock).mockReset().mockReturnThis();
  (db.delete as jest.Mock).mockReset().mockReturnThis();
  (db.from as jest.Mock).mockReset().mockReturnThis();
  (db.where as jest.Mock).mockReset().mockReturnThis();
  (db.set as jest.Mock).mockReset().mockReturnThis();
  (db.values as jest.Mock).mockReset().mockReturnThis();
  (db.limit as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.returning as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.then as jest.Mock).mockReset().mockImplementation((resolve: unknown, reject: unknown) =>
    Promise.resolve([]).then(resolve, reject)
  );
  (db.transaction as jest.Mock).mockReset().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(db));
  (db.execute as jest.Mock).mockReset().mockResolvedValue({ rows: [] });
  broadcastMock.mockReset();
  sendToUserMock.mockReset();
});

describe("POST /api/requests/:id/safety-ping", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/1/safety-ping").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not a participant", async () => {
    (db.limit as jest.Mock).mockResolvedValueOnce([{ requester_id: 10, helper_id: 20, status: "claimed" }]);
    const res = await request(app)
      .post("/api/requests/1/safety-ping")
      .set("Authorization", bearerToken(99))
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 409 when the session is already finished", async () => {
    (db.limit as jest.Mock).mockResolvedValueOnce([{ requester_id: 10, helper_id: 20, status: "completed" }]);
    const res = await request(app)
      .post("/api/requests/1/safety-ping")
      .set("Authorization", bearerToken(10))
      .send({});
    expect(res.status).toBe(409);
  });

  it("returns 200 and broadcasts the ping even if the updated_at write fails (fire-and-forget)", async () => {
    (db.limit as jest.Mock).mockResolvedValueOnce([{ requester_id: 10, helper_id: 20, status: "en_route" }]);
    // Simulate a DB hiccup on the fire-and-forget updated_at write — the
    // response must not depend on it succeeding.
    (db.catch as jest.Mock).mockImplementationOnce((reject: unknown) => Promise.reject(new Error("db down")).catch(reject));
    const res = await request(app)
      .post("/api/requests/1/safety-ping")
      .set("Authorization", bearerToken(20))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pinged_at).toBeTruthy();
    // Regression guard: migration 0061 added a real updated_at column to
    // help_requests — this endpoint is expected to write to it now (it's no
    // longer the nonexistent-column bug this suite was originally written
    // to catch), but that write must stay fire-and-forget so a DB hiccup on
    // it can never turn a safety-critical response into a 500.
    expect(db.update).toHaveBeenCalled();
    expect(broadcastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "safety_ping",
        payload: expect.objectContaining({ request_id: 1, user_id: 20 }),
      })
    );
  });
});

describe("POST /api/requests/:id/safety-sos", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).post("/api/requests/1/safety-sos").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not a participant", async () => {
    (db.limit as jest.Mock).mockResolvedValueOnce([{ requester_id: 10, helper_id: 20, title: "Groceries", status: "claimed" }]);
    const res = await request(app)
      .post("/api/requests/1/safety-sos")
      .set("Authorization", bearerToken(99))
      .send({ role: "requester" });
    expect(res.status).toBe(403);
  });

  it("returns 409 when the session is not active (e.g. completed)", async () => {
    (db.limit as jest.Mock).mockResolvedValueOnce([{ requester_id: 10, helper_id: 20, title: "Groceries", status: "completed" }]);
    const res = await request(app)
      .post("/api/requests/1/safety-sos")
      .set("Authorization", bearerToken(10))
      .send({ role: "requester" });
    expect(res.status).toBe(409);
    expect(res.body.status).toBe("completed");
  });

  it("returns 200, broadcasts to admins, and notifies the other participant", async () => {
    (db.limit as jest.Mock)
      .mockResolvedValueOnce([{ requester_id: 10, helper_id: 20, title: "Groceries", status: "en_route" }])
      .mockResolvedValueOnce([{ name: "Ama" }]);
    const res = await request(app)
      .post("/api/requests/1/safety-sos")
      .set("Authorization", bearerToken(10))
      .send({ role: "requester" });
    expect(res.status).toBe(200);
    expect(broadcastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "safety_sos",
        payload: expect.objectContaining({ request_id: 1, triggered_by: 10, triggered_by_name: "Ama" }),
      })
    );
    expect(sendToUserMock).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ type: "safety_sos" })
    );
  });
});
