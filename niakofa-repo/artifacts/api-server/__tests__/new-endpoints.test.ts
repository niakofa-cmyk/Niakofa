/**
 * New-endpoint regression tests.
 *
 * Covers the four endpoints added/restored in the 5-gap audit pass:
 *   - POST  /requests/:id/tip-wallet
 *   - PATCH /users/:id/toggle-admin
 *   - DELETE /griot/stories/:id
 *   - GET   /civic/needs/:id
 *
 * All DB interactions are mocked — no real Postgres connection needed.
 * Uses jest.unstable_mockModule() (not jest.mock()) because the project
 * runs under Jest's native ESM support (--experimental-vm-modules).
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import express from "express";

// ── Shared chainable DB mock ──────────────────────────────────────────────────
const mockDb: Record<string, jest.Mock> = {
  select:   jest.fn().mockReturnThis(),
  update:   jest.fn().mockReturnThis(),
  insert:   jest.fn().mockReturnThis(),
  delete:   jest.fn().mockReturnThis(),
  from:     jest.fn().mockReturnThis(),
  where:    jest.fn().mockReturnThis(),
  set:      jest.fn().mockReturnThis(),
  values:   jest.fn().mockReturnThis(),
  limit:    jest.fn().mockResolvedValue([]),
  returning: jest.fn().mockResolvedValue([]),
  orderBy:  jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  groupBy:  jest.fn().mockReturnValue([]),
  offset:   jest.fn().mockReturnThis(),
  transaction: jest.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockDb)),
  then: jest.fn().mockImplementation((resolve: any, reject: any) =>
    Promise.resolve([]).then(resolve, reject)
  ),
  execute: jest.fn().mockResolvedValue({ rows: [] }),
};

// ── Module mocks (must be registered BEFORE any dynamic import) ───────────────
jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  requestsTable:           { id: "id", status: "status", helper_id: "helper_id", requester_id: "requester_id" },
  usersTable:              { id: "id", name: "name", email: "email", is_admin: "is_admin", benevolence_wallet: "benevolence_wallet", active: "active" },
  transactionsTable:       { id: "id", user_id: "user_id", amount: "amount", type: "type", description: "description", created_at: "created_at" },
  griotStoriesTable:       { id: "id", author_id: "author_id", hub_id: "hub_id", status: "status" },
  civicNeedsTable:         { id: "id", title: "title", status: "status", lat: "lat", lng: "lng", government_sponsor_id: "government_sponsor_id", description: "description", category: "category", estimated_cost: "estimated_cost", due_date: "due_date", claimed_by_user_id: "claimed_by_user_id", claimed_at: "claimed_at", completed_at: "completed_at", created_at: "created_at", address: "address" },
  governmentSponsorsTable: { id: "id", user_id: "user_id", entity_name: "entity_name" },
  systemSettingsTable:     { key: "key", value: "value" },
  communityPoolLedgerTable: { id: "id", amount: "amount", hub_id: "hub_id", community_id: "community_id", type: "type", request_id: "request_id", user_id: "user_id", description: "description", created_at: "created_at" },
  diasporaHubsTable:       { id: "id", community_id: "community_id", name: "name", reserved_balance: "reserved_balance" },
  communitiesTable:        { id: "id", name: "name" },
  stripeAccountsTable:     { id: "id", user_id: "user_id", payouts_enabled: "payouts_enabled", stripe_account_id: "stripe_account_id" },
  requestHelpersTable:     { id: "id", request_id: "request_id", helper_id: "helper_id" },
  ratingsTable:            { id: "id" },
  reportsTable:            { id: "id" },
  chatMessagesTable:       { id: "id", request_id: "request_id", sender_id: "sender_id", content: "content", sent_at: "sent_at", read_at: "read_at" },
  paymentTransactionsTable: { id: "id", request_id: "request_id", state: "state" },
  scheduledPaymentsTable:  { id: "id", user_id: "user_id" },
  walletCashoutsTable:     { id: "id", user_id: "user_id" },
  helperAvailabilityTable: { id: "id", user_id: "user_id" },
  businessesTable:         { id: "id" },
  businessMembersTable:    { id: "id", business_id: "business_id", user_id: "user_id" },
  userSettingsTable:       { id: "id", user_id: "user_id" },
  poolPendingMinisumsTable: { id: "id", request_id: "request_id" },
  hubCommunityLeadersTable: { id: "id", user_id: "user_id", hub_id: "hub_id", approved: "approved", approved_at: "approved_at" },
  niaToggleAuditTable:     { id: "id", enabled: "enabled", admin_user_id: "admin_user_id", admin_email: "admin_email", reason: "reason" },
  diasporaHubPledgesTable: { id: "id", from_hub_id: "from_hub_id", pledged_by: "pledged_by", amount: "amount", message: "message", status: "status", created_at: "created_at" },
  storyTranslationsTable:  { id: "id", story_id: "story_id", locale: "locale", title: "title", content: "content" },
  griotTranscriptionJobsTable: { id: "id", story_id: "story_id", status: "status" },
  audioCirclesTable:       { id: "id", city_key: "city_key", name: "name", neighborhood_id: "neighborhood_id", community_id: "community_id" },
  audioCircleSessionsTable: { id: "id", circle_id: "circle_id", host_id: "host_id", status: "status" },
  audioCircleParticipantsTable: { id: "id", session_id: "session_id", user_id: "user_id", role: "role" },
  cityNeighborhoodsTable:  { id: "id", city_key: "city_key", name: "name" },
  civicResourcesTable:     { id: "id", title: "title", category: "category", community_id: "community_id" },
  civicSuggestionsTable:   { id: "id", title: "title", submitted_by: "submitted_by", status: "status" },
  civicInvoicesTable:      { id: "id", civic_need_id: "civic_need_id", amount: "amount", status: "status", due_date: "due_date" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq:    jest.fn((a: any, b: any) => ({ _eq: [a, b] })),
  and:   jest.fn((...args: any[]) => ({ _and: args })),
  or:    jest.fn((...args: any[]) => ({ _or: args })),
  ne:    jest.fn((a: any, b: any) => ({ _ne: [a, b] })),
  gt:    jest.fn((a: any, b: any) => ({ _gt: [a, b] })),
  gte:   jest.fn((a: any, b: any) => ({ _gte: [a, b] })),
  lt:    jest.fn((a: any, b: any) => ({ _lt: [a, b] })),
  lte:   jest.fn((a: any, b: any) => ({ _lte: [a, b] })),
  isNull: jest.fn((a: any) => ({ _isNull: a })),
  isNotNull: jest.fn((a: any) => ({ _isNotNull: a })),
  sql:   jest.fn((s: any) => s),
  desc:  jest.fn((a: any) => ({ _desc: a })),
  asc:   jest.fn((a: any) => ({ _asc: a })),
  inArray: jest.fn((a: any, b: any) => ({ _in: [a, b] })),
  count: jest.fn(() => "count"),
  sum:   jest.fn((a: any) => ({ _sum: a })),
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  parseAuth:       jest.fn(),
  requireAuth:     jest.fn((_req: any, _res: any, next: any) => next()),
  requireApproved: jest.fn((_req: any, _res: any, next: any) => next()),
  signTokenById:   jest.fn().mockReturnValue("test-token"),
  verifyToken:     jest.fn().mockReturnValue({ userId: 1, valid: true }),
  isSelf:          jest.fn().mockReturnValue(false),
}));

jest.unstable_mockModule("../src/middlewares/authz.js", () => ({
  requireAdmin:    () => (_req: any, _res: any, next: any) => next(),
  requireOwnership: () => (_req: any, _res: any, next: any) => next(),
  resolveMeParam:  (_req: any, _res: any, next: any) => next(),
}));

const _passthrough = (_req: any, _res: any, next: any) => next();
jest.unstable_mockModule("../src/middlewares/rate-limit.js", () => ({
  authLimiter:            _passthrough,
  gpsLimiter:             _passthrough,
  adminLimiter:           _passthrough,
  generalApiLimiter:      _passthrough,
  spendingCapLimiter:     _passthrough,
  requestCreationLimiter: _passthrough,
  paymentLimiter:         _passthrough,
  communityPostLimiter:   _passthrough,
  communityLikeLimiter:   _passthrough,
  chatLimiter:            _passthrough,
  crisisAwareChatLimiter: _passthrough,
  niaChatHistoryLimiter:  _passthrough,
  voiceLimiter:           _passthrough,
  navigationLimiter:      _passthrough,
}));

jest.unstable_mockModule("../src/lib/ws-hub.js", () => ({
  broadcast:     jest.fn(),
  broadcastToUser: jest.fn(),
  sendToUser:    jest.fn(),
  broadcastRequestEvent: jest.fn(),
  sendToRequestParticipants: jest.fn(),
}));

jest.unstable_mockModule("../src/lib/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule("../src/lib/community-pool.js", () => ({
  payHelperFromPool:         jest.fn().mockResolvedValue({ outcome: "ok" }),
  payHelpersFromPool:        jest.fn().mockResolvedValue({ outcome: "ok" }),
  syncHubReservedBalance:    jest.fn().mockResolvedValue(undefined),
  getPoolBalance:            jest.fn().mockResolvedValue(0),
  getGuaranteedMinimum:      jest.fn().mockResolvedValue(0),
  isPoolEnabled:             jest.fn().mockResolvedValue(false),
  queuePendingMinimum:       jest.fn().mockResolvedValue(undefined),
  maybeAlertLowBalance:      jest.fn().mockResolvedValue(undefined),
  getHourlyMinimumRate:      jest.fn().mockResolvedValue(0),
  getDefaultCommunityId:     jest.fn().mockResolvedValue(null),
  getHubReservedBalance:     jest.fn().mockResolvedValue(0),
  recordPoolContribution:    jest.fn().mockResolvedValue(undefined),
  processPendingMinimums:    jest.fn().mockResolvedValue(0),
  getLowBalanceThreshold:    jest.fn().mockResolvedValue(25),
  wasRequestFronted:         jest.fn().mockResolvedValue(false),
  recordPoolRepayment:       jest.fn().mockResolvedValue(undefined),
  toCents:                   jest.fn((x: number) => Math.round(x * 100)),
  roundMoney:                jest.fn((x: number) => x),
}));

jest.unstable_mockModule("../src/lib/scheduler.js", () => ({
  schedulePledgeReminder: jest.fn(),
  cancelPledgeReminder:   jest.fn(),
}));

jest.unstable_mockModule("../src/lib/mailer.js", () => ({
  sendMail:      jest.fn().mockResolvedValue(undefined),
  sendReceipt:   jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../src/lib/cache.js", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../src/lib/geo.js", () => ({
  distanceMiles: jest.fn().mockReturnValue(1.0),
}));

jest.unstable_mockModule("../src/lib/sanitize.js", () => ({
  stripTags: jest.fn((s: string) => s),
}));

jest.unstable_mockModule("../src/lib/post-moderation.js", () => ({
  moderateRequestText: jest.fn().mockResolvedValue({ flagged: false }),
  moderatePostText:    jest.fn().mockResolvedValue({ flagged: false }),
}));

jest.unstable_mockModule("../src/routes/leaderboard.js", () => ({
  broadcastLeaderboardUpdate: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../src/routes/push.js", () => ({
  sendPushToNearbyHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToAllHelpers:    jest.fn().mockResolvedValue(undefined),
  sendPushToUser:          jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("stripe", () => ({
  default: jest.fn().mockImplementation(() => ({})),
}));

jest.unstable_mockModule("@workspace/trust-tiers", () => ({
  getTrustTier:        jest.fn().mockReturnValue("new"),
  getEffectiveTier:    jest.fn().mockReturnValue("new"),
  meetsQualityGate:    jest.fn().mockReturnValue(true),
  TIER_RANK:           { new: 0, trusted: 1, elite: 2, anchor: 3 },
  tierAtLeast:         jest.fn().mockReturnValue(false),
  isSensitiveCategory: jest.fn().mockReturnValue(false),
  getHubLeadershipTrustBonus: jest.fn().mockReturnValue(0),
}));

jest.unstable_mockModule("../src/lib/queue.js", () => ({
  enqueuePayoutRetry:    jest.fn().mockResolvedValue(true),
  enqueueCashoutRetry:   jest.fn().mockResolvedValue(true),
  enqueueNotification:   jest.fn().mockResolvedValue(true),
  getRedisConnection:    jest.fn().mockReturnValue(null),
  isRedisConfigured:     jest.fn().mockReturnValue(false),
  getRedisUrlStatus:     jest.fn().mockReturnValue("not_set"),
  parseRedisUrl:         jest.fn().mockReturnValue(undefined),
  QUEUE:                 {},
}));

// ── Dynamic imports after mocks are registered ────────────────────────────────
let requestsRouter: any;
let usersRouter: any;
let griotRouter: any;
let civicRouter: any;
let requireAuth: jest.Mock;
let requireApproved: jest.Mock;

beforeAll(async () => {
  const auth = await import("../src/middlewares/auth.js") as any;
  requireAuth    = auth.requireAuth;
  requireApproved = auth.requireApproved;
  requestsRouter = (await import("../src/routes/requests.js")).default;
  usersRouter    = (await import("../src/routes/users.js")).default;
  griotRouter    = (await import("../src/routes/griot.js")).default;
  civicRouter    = (await import("../src/routes/civic.js")).default;
});

const resetMockDb = () => {
  // Make all chainable methods return the proxy again
  for (const k of Object.keys(mockDb)) {
    const fn = (mockDb as any)[k];
    if (fn && typeof fn.mockReturnThis === "function") fn.mockReturnThis();
  }
  // Terminal methods: return empty by default
  mockDb.limit.mockResolvedValue([]);
  mockDb.returning.mockResolvedValue([]);
  mockDb.execute.mockResolvedValue({ rows: [] });
  // then() — the "await on a query chain" path — returns empty array
  mockDb.then.mockImplementation((resolve: any, _reject: any) =>
    Promise.resolve([]).then(resolve)
  );
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockDb));
};

beforeEach(() => {
  jest.resetAllMocks();
  // Re-wire middleware mocks after reset
  (requireAuth as jest.Mock).mockImplementation((req: any, _res: any, next: any) => {
    req.authenticatedUserId = 1;
    req.authenticatedUser   = { id: 1, name: "Test", email: "test@test.com", is_admin: true, active: true };
    next();
  });
  (requireApproved as jest.Mock).mockImplementation((_req: any, _res: any, next: any) => next());
  resetMockDb();
});

// ── Helper: build a minimal Express app from a router ────────────────────────
function makeApp(router: any) {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

// ════════════════════════════════════════════════════════════════════════════
// POST /requests/:id/tip-wallet
// ════════════════════════════════════════════════════════════════════════════
describe("POST /requests/:id/tip-wallet", () => {
  it("returns 401 when not authenticated", async () => {
    (requireAuth as jest.Mock).mockImplementation((_req: any, res: any) =>
      res.status(401).json({ error: "Unauthorized" })
    );
    const app = makeApp(requestsRouter);
    const res = await request(app).post("/requests/1/tip-wallet").send({ tip_amount_cents: 500 });
    expect(res.status).toBe(401);
  });

  it("returns 400 when tip_amount_cents is missing", async () => {
    const app = makeApp(requestsRouter);
    // Send no tip_amount_cents → route returns 400 before any DB call
    const res = await request(app)
      .post("/requests/1/tip-wallet")
      .set("Authorization", "Bearer test")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 402 when wallet balance is insufficient", async () => {
    // First .limit() = request lookup (requester_id:1 = callerId:1, status:"completed")
    // Second .limit() = wallet lookup (balance: 0)
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, requester_id: 1, helper_id: 3, status: "completed" }])
      .mockResolvedValueOnce([{ benevolence_wallet: 0 }]);
    const app = makeApp(requestsRouter);
    const res = await request(app)
      .post("/requests/1/tip-wallet")
      .set("Authorization", "Bearer test")
      .send({ tip_amount_cents: 500 }); // $5 in cents
    expect(res.status).toBe(402);
    expect(res.body).toHaveProperty("code", "insufficient_balance");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /users/:id/toggle-admin
// ════════════════════════════════════════════════════════════════════════════
describe("PATCH /users/:id/toggle-admin", () => {
  it("returns 401 when not authenticated", async () => {
    (requireAuth as jest.Mock).mockImplementation((_req: any, res: any) =>
      res.status(401).json({ error: "Unauthorized" })
    );
    const app = makeApp(usersRouter);
    const res = await request(app).patch("/users/2/toggle-admin");
    expect(res.status).toBe(401);
  });

  it("returns 409 when trying to toggle own admin status", async () => {
    const app = makeApp(usersRouter);
    const res = await request(app)
      .patch("/users/1/toggle-admin")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(409);
  });

  it("returns 404 when target user does not exist", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const app = makeApp(usersRouter);
    const res = await request(app)
      .patch("/users/999/toggle-admin")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(404);
  });

  it("toggles is_admin and returns the new value", async () => {
    mockDb.limit.mockResolvedValueOnce([{ is_admin: false }]);
    mockDb.where.mockReturnThis();
    const app = makeApp(usersRouter);
    const res = await request(app)
      .patch("/users/2/toggle-admin")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, user_id: 2, is_admin: true });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DELETE /griot/stories/:id
// ════════════════════════════════════════════════════════════════════════════
describe("DELETE /griot/stories/:id", () => {
  it("returns 401 when not authenticated", async () => {
    (requireAuth as jest.Mock).mockImplementation((_req: any, res: any) =>
      res.status(401).json({ error: "Unauthorized" })
    );
    const app = makeApp(griotRouter);
    const res = await request(app).delete("/griot/stories/1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when story does not exist", async () => {
    // griot DELETE uses db.select().from().where() without .limit() → resolves via .then()
    mockDb.then.mockImplementationOnce((resolve: any) =>
      Promise.resolve([]).then(resolve)
    );
    const app = makeApp(griotRouter);
    const res = await request(app)
      .delete("/griot/stories/999")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is not author and not admin", async () => {
    // Caller is user 2, story author is 1, user 2 is not admin
    (requireAuth as jest.Mock).mockImplementation((req: any, _res: any, next: any) => {
      req.authenticatedUserId = 2;
      req.authenticatedUser   = { id: 2, name: "Other", email: "other@test.com", is_admin: false, active: true };
      next();
    });
    (requireApproved as jest.Mock).mockImplementation((_req: any, _res: any, next: any) => next());
    // Story fetch uses await db.select().from().where() — resolves via .then()
    mockDb.then.mockImplementationOnce((resolve: any) =>
      Promise.resolve([{ id: 1, author_id: 1, status: "published" }]).then(resolve)
    );
    // Caller is_admin check uses .limit(1)
    mockDb.limit.mockResolvedValueOnce([{ is_admin: false }]);
    const app = makeApp(griotRouter);
    const res = await request(app)
      .delete("/griot/stories/1")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(403);
  });

  it("deletes the story when caller is the author", async () => {
    // Story fetch resolves via .then() — author_id:1 = callerId:1
    mockDb.then.mockImplementationOnce((resolve: any) =>
      Promise.resolve([{ id: 1, author_id: 1, status: "published" }]).then(resolve)
    );
    // Admin check via .limit(1) not needed since author check short-circuits
    const app = makeApp(griotRouter);
    const res = await request(app)
      .delete("/griot/stories/1")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /civic/needs/:id
// ════════════════════════════════════════════════════════════════════════════
describe("GET /civic/needs/:id", () => {
  it("returns 401 when not authenticated", async () => {
    (requireAuth as jest.Mock).mockImplementation((_req: any, res: any) =>
      res.status(401).json({ error: "Unauthorized" })
    );
    const app = makeApp(civicRouter);
    const res = await request(app).get("/civic/needs/1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when need does not exist", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const app = makeApp(civicRouter);
    const res = await request(app)
      .get("/civic/needs/1")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(404);
  });

  it("returns the civic need when found", async () => {
    const need = {
      id: 1, title: "Fix pothole", description: null, category: "infrastructure",
      estimated_cost: 500, due_date: null, status: "open",
      lat: 32.7767, lng: -96.7970, address: "123 Main St",
      claimed_by_user_id: null, claimed_at: null, completed_at: null,
      created_at: new Date().toISOString(),
      sponsor_entity_name: "Dallas City",
    };
    mockDb.limit.mockResolvedValueOnce([need]);
    const app = makeApp(civicRouter);
    const res = await request(app)
      .get("/civic/needs/1")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, title: "Fix pothole" });
  });

  it("returns 400 for non-numeric id", async () => {
    const app = makeApp(civicRouter);
    const res = await request(app)
      .get("/civic/needs/abc")
      .set("Authorization", "Bearer test");
    expect(res.status).toBe(400);
  });
});
