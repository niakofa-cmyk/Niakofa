/**
 * Pledge Auto-Default Regression Tests
 *
 * Guards the single source of truth for pledge auto-defaults:
 * scheduler.ts::processPledgeDefaults (runs every 12 h via setInterval).
 *
 * Historical context: pledge-worker.ts previously contained an identical
 * Step 6 (auto-default) that ran via BullMQ daily. The duplication was safe
 * thanks to the atomic WHERE pledge_status='active' guard, but created drift
 * risk. Step 6 was removed from pledge-worker.ts; scheduler.ts is now the
 * sole owner of auto-default logic.
 *
 * What these tests verify:
 *   1. processPledgeDefaults exits cleanly when there are no overdue rows
 *   2. Calls db.update for each overdue pledge
 *   3. Skips the trust penalty when update returns 0 rows (concurrent race)
 *   4. pledge-worker.ts startPledgeWorker returns null without Redis
 *
 * NOTE: this suite runs under Jest's native ESM support
 * (--experimental-vm-modules). Under native ESM, `jest.mock()` does NOT
 * intercept dynamic `await import()` calls — only `jest.unstable_mockModule()`
 * does. All mocked modules are registered below BEFORE any dynamic import.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ── Shared mutable state controlled per-test ──────────────────────────────────
let _overdueRows: unknown[] = [];
let _updateReturning: unknown[] = [];

// ── Mock builders ─────────────────────────────────────────────────────────────
// The scheduler's select chain ends with .where() (no .limit()).
// The scheduler's update chain ends with .where().returning().
//
// Strategy: make .where() return an object that:
//   a) resolves to _overdueRows when awaited (for select chains), AND
//   b) exposes a .returning() method (for update chains)
//
// We achieve (a) by making the returned object thenable.

function makeWhereResult(resolveValue: unknown[]) {
  const obj = {
    _value: resolveValue,
    returning: jest.fn(() => Promise.resolve(_updateReturning)),
    // Thenable — allows `await db.select().from().where()` to resolve to _overdueRows
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(this._value).then(resolve, reject);
    },
    catch(reject: (e: unknown) => unknown) {
      return Promise.resolve(this._value).catch(reject);
    },
    limit: jest.fn(() => Promise.resolve([])),
  };
  return obj;
}

// Track which .where() calls are select vs update via call count
let whereCallCount = 0;

// mockDb defined OUTSIDE the factory so:
//  1. beforeEach can reset individual methods
//  2. the factory closes over the same reference
const mockDb = {
  select:    jest.fn().mockReturnThis() as jest.Mock,
  update:    jest.fn().mockReturnThis() as jest.Mock,
  from:      jest.fn().mockReturnThis() as jest.Mock,
  set:       jest.fn().mockReturnThis() as jest.Mock,
  where:     jest.fn(() => {
    whereCallCount++;
    return makeWhereResult(whereCallCount === 1 ? _overdueRows : []);
  }) as jest.Mock,
};

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  requestsTable: {
    id: "id",
    payment_type: "payment_type",
    status: "status",
    pledge_status: "pledge_status",
    pledge_paid: "pledge_paid",
    pledge_amount: "pledge_amount",
    completed_at: "completed_at",
    hardship_requested_at: "hardship_requested_at",
    requester_id: "requester_id",
    title: "title",
  },
  usersTable: {
    id: "id",
    trust_score: "trust_score",
    goodwill_score: "goodwill_score",
    email: "email",
    name: "name",
  },
  communitiesTable: { id: "id", name: "name", target_reserve_amount: "target_reserve_amount" },
  communityPoolLedgerTable: { id: "id", amount: "amount", request_id: "request_id" },
  communityPoolFinancialEventsTable: {},
  poolPendingMinimumsTable: { id: "id", request_id: "request_id" },
  scheduledPaymentsTable: { id: "id", user_id: "user_id", status: "status" },
  walletCashoutsTable: { id: "id", user_id: "user_id", status: "status" },
  paymentTransactionsTable: { id: "id", request_id: "request_id", state: "state" },
  transactionsTable: { id: "id", user_id: "user_id" },
  ratingsTable: { id: "id", request_id: "request_id", stars: "stars" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq:     jest.fn((_col: unknown, val: unknown) => ({ eq: { _col, val } })),
  and:    jest.fn((...args: unknown[]) => ({ and: args })),
  or:     jest.fn((...args: unknown[]) => ({ or: args })),
  sql:    Object.assign(jest.fn((s: unknown) => s), {
    raw: jest.fn((s: unknown) => s),
  }),
  isNull:     jest.fn((col: unknown) => ({ isNull: col })),
  isNotNull:  jest.fn((col: unknown) => ({ isNotNull: col })),
  lte:    jest.fn((_col: unknown, val: unknown) => ({ lte: { _col, val } })),
  lt:     jest.fn((_col: unknown, val: unknown) => ({ lt: { _col, val } })),
  gte:    jest.fn((_col: unknown, val: unknown) => ({ gte: { _col, val } })),
  gt:     jest.fn((_col: unknown, val: unknown) => ({ gt: { _col, val } })),
  ne:     jest.fn((_col: unknown, val: unknown) => ({ ne: { _col, val } })),
  asc:    jest.fn((col: unknown) => ({ asc: col })),
  desc:   jest.fn((col: unknown) => ({ desc: col })),
  inArray:    jest.fn(),
  notInArray: jest.fn(),
  not:        jest.fn(),
}));

jest.unstable_mockModule("../lib/queue.js", () => ({
  getRedisConnection: jest.fn().mockReturnValue(null),
  isRedisConfigured: jest.fn().mockReturnValue(false),
  getRedisUrlStatus: jest.fn().mockReturnValue("not_set"),
  QUEUE: { PLEDGE_RECONCILIATION: "pledge-reconciliation" },
  pledgeQueue: null,
}));

jest.unstable_mockModule("../routes/push.js", () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  sendPushToNearbyHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToAllHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToUsers: jest.fn().mockResolvedValue(undefined),
  default: { get: jest.fn(), post: jest.fn(), use: jest.fn() },
}));

jest.unstable_mockModule("../lib/mailer.js", () => ({
  sendAlertEmail: jest.fn().mockResolvedValue(undefined),
  sendReceipt: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function overdueRow(overrides: Record<string, unknown> = {}) {
  const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
  return {
    id: 1,
    requester_id: 42,
    completed_at: ninetyOneDaysAgo,
    pledge_status: "active",
    pledge_paid: 0,
    pledge_amount: 50,
    hardship_requested_at: null,
    title: "Help moving furniture",
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
  whereCallCount = 0;
  _overdueRows = [];
  _updateReturning = [{ id: 1 }];

  // Re-wire chain to return mockDb for select/update steps
  mockDb.select.mockReturnValue(mockDb);
  mockDb.update.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.set.mockReturnValue(mockDb);
  // Reset where to default implementation
  mockDb.where.mockImplementation(() => {
    whereCallCount++;
    return makeWhereResult(whereCallCount === 1 ? _overdueRows : []);
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("processPledgeDefaults (scheduler.ts — sole auto-default owner)", () => {
  it("exits cleanly when there are no overdue pledges", async () => {
    _overdueRows = [];
    const { processPledgeDefaults } = await import("../lib/scheduler.js");
    await expect(processPledgeDefaults()).resolves.not.toThrow();
    // No update should run — the function short-circuits at overdue.length === 0
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("calls db.update for an overdue pledge", async () => {
    _overdueRows = [overdueRow()];
    _updateReturning = [{ id: 1 }]; // update wins the atomic race

    const { processPledgeDefaults } = await import("../lib/scheduler.js");
    await processPledgeDefaults();

    // Should have called update at least once (pledge_status → 'defaulted')
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("skips trust penalty when update returns 0 rows (concurrent worker won the race)", async () => {
    _overdueRows = [overdueRow()];
    _updateReturning = []; // another instance already defaulted this row

    // Track usersTable update calls by checking if update was called on usersTable
    // (second call to update should NOT happen because updated.length === 0 → continue)
    let updateCallCount = 0;
    mockDb.update.mockImplementation(() => {
      updateCallCount++;
      return mockDb;
    });

    const { processPledgeDefaults } = await import("../lib/scheduler.js");
    await processPledgeDefaults();

    // First update = requestsTable (pledge_status)
    // If idempotency guard works, NO second update (usersTable trust penalty) should run
    expect(updateCallCount).toBe(1);
  });

  it("processes multiple overdue rows without throwing", async () => {
    _overdueRows = [
      overdueRow({ id: 1, requester_id: 10 }),
      overdueRow({ id: 2, requester_id: 11 }),
    ];

    // First row: update wins (returns row). Second: also wins.
    _updateReturning = [{ id: 1 }];

    // Allow multiple where() calls — first one = select, subsequent = update chains
    let wc = 0;
    mockDb.where.mockImplementation(() => {
      wc++;
      return makeWhereResult(wc === 1 ? _overdueRows : [{ id: wc }]);
    });

    const { processPledgeDefaults } = await import("../lib/scheduler.js");
    await expect(processPledgeDefaults()).resolves.not.toThrow();
  });
});

describe("pledge-worker.ts Step 6 — removed (auto-default is now scheduler.ts only)", () => {
  it("startPledgeWorker returns null when Redis is not configured", async () => {
    const { startPledgeWorker } = await import("../workers/pledge-worker.js");
    const result = await startPledgeWorker();
    // Redis mock returns null → worker cannot start → returns null gracefully
    expect(result).toBeNull();
  });
});
