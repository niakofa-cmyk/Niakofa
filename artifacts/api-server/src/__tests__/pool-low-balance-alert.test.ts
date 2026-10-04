import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const LOW_BALANCE_THRESHOLD_KEY = "pool_low_balance_threshold";
const LOW_BALANCE_ALERT_KEY = "pool_low_balance_last_alerted_at";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const state = {
  balance: 0,
  threshold: 25,
  lastAlertAt: null as string | null,
  admins: [7, 9],
};
let currentTime = NOW;
let transactionQueue: Promise<unknown> = Promise.resolve();

const systemSettingsTable = {
  key: "system_settings.key",
  value: "system_settings.value",
  updated_at: "system_settings.updated_at",
};
const communityPoolLedgerTable = { amount: "community_pool_ledger.amount" };
const usersTable = { id: "users.id", is_admin: "users.is_admin" };

function queryRows(table: unknown, condition?: { value?: unknown }): Array<Record<string, unknown>> {
  if (table === communityPoolLedgerTable) return [{ balance: state.balance }];
  if (table === systemSettingsTable) {
    if (condition?.value === LOW_BALANCE_THRESHOLD_KEY) {
      return [{ value: String(state.threshold) }];
    }
    if (condition?.value === LOW_BALANCE_ALERT_KEY && state.lastAlertAt != null) {
      return [{ value: state.lastAlertAt }];
    }
    return [];
  }
  if (table === usersTable && condition?.value === true) {
    return state.admins.map((id) => ({ id }));
  }
  return [];
}

function makeQuery() {
  let table: unknown;
  let condition: { value?: unknown } | undefined;
  const query: Record<string, unknown> = {};
  query.from = (value: unknown) => {
    table = value;
    return query;
  };
  query.where = (value: { value?: unknown }) => {
    condition = value;
    return query;
  };
  query.limit = async () => queryRows(table, condition);
  query.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(queryRows(table, condition)).then(resolve, reject);
  return query;
}

const selectMock = jest.fn(() => makeQuery());
const insertMock = jest.fn(() => {
  let insertedValues: Record<string, unknown> = {};
  return {
    values: jest.fn((values: Record<string, unknown>) => {
      insertedValues = values;
      return {
        onConflictDoUpdate: jest.fn(async (config: { set?: { value?: unknown } }) => {
          if (insertedValues.key === LOW_BALANCE_ALERT_KEY) {
            state.lastAlertAt = String(config.set?.value ?? insertedValues.value);
          }
          return [];
        }),
      };
    }),
  };
});
const txMock = {
  execute: jest.fn().mockResolvedValue({ rows: [] }),
  select: selectMock,
  insert: insertMock,
};
const transactionMock = jest.fn((callback: (tx: unknown) => Promise<unknown>) => {
  const current = transactionQueue.then(() => callback(txMock));
  transactionQueue = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
});
const dbMock = {
  select: selectMock,
  transaction: transactionMock,
};

const broadcastMock = jest.fn();
const sendPushToUserMock = jest.fn().mockResolvedValue(undefined);
const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db: dbMock,
  communitiesTable: { id: "id", name: "name", hourly_rate: "hourly_rate", target_reserve_amount: "target_reserve_amount" },
  communityPoolLedgerTable,
  communityPoolFinancialEventsTable: {},
  poolPendingMinimumsTable: { id: "id" },
  systemSettingsTable,
  usersTable,
  transactionsTable: { id: "id" },
  diasporaHubsTable: { id: "id" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  and: jest.fn(),
  asc: jest.fn(),
  eq: jest.fn((column: unknown, value: unknown) => ({ column, value })),
  or: jest.fn(),
  sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

jest.unstable_mockModule("../lib/ws-hub.js", () => ({ broadcast: broadcastMock }));
jest.unstable_mockModule("../lib/logger.js", () => ({ logger: loggerMock }));
jest.unstable_mockModule("../routes/push.js", () => ({
  sendPushToUser: sendPushToUserMock,
}));

let maybeAlertLowBalance: () => Promise<void>;

beforeAll(async () => {
  ({ maybeAlertLowBalance } = await import("../lib/community-pool.js"));
});

beforeEach(() => {
  jest.clearAllMocks();
  state.balance = 10;
  state.threshold = 25;
  state.lastAlertAt = null;
  state.admins = [7, 9];
  currentTime = NOW;
  transactionQueue = Promise.resolve();
  jest.spyOn(Date, "now").mockImplementation(() => currentTime);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Community Pool low-balance alert", () => {
  it("pushes admins only when the global balance is strictly below the configured threshold", async () => {
    state.threshold = 30;
    state.balance = 29.99;
    await maybeAlertLowBalance();

    expect(state.lastAlertAt).toBe(String(NOW));
    expect(broadcastMock).toHaveBeenCalledWith({
      type: "pool_low_balance",
      payload: { balance: 29.99, threshold: 30 },
    });
    expect(sendPushToUserMock).toHaveBeenCalledTimes(2);
    expect(sendPushToUserMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ title: "⚠️ Community Pool low balance" }),
    );
  });

  it("does not alert when the balance equals the threshold", async () => {
    state.balance = 25;
    await maybeAlertLowBalance();

    expect(transactionMock).not.toHaveBeenCalled();
    expect(broadcastMock).not.toHaveBeenCalled();
    expect(sendPushToUserMock).not.toHaveBeenCalled();
  });

  it("shares the six-hour cooldown across concurrent checks and allows a later reminder", async () => {
    await Promise.all([maybeAlertLowBalance(), maybeAlertLowBalance()]);

    expect(state.lastAlertAt).toBe(String(NOW));
    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(sendPushToUserMock).toHaveBeenCalledTimes(2);

    currentTime = NOW + SIX_HOURS_MS - 1;
    await maybeAlertLowBalance();
    expect(broadcastMock).toHaveBeenCalledTimes(1);

    currentTime = NOW + SIX_HOURS_MS;
    await maybeAlertLowBalance();
    expect(broadcastMock).toHaveBeenCalledTimes(2);
    expect(sendPushToUserMock).toHaveBeenCalledTimes(4);
  });

  it("checks both single-helper and split-helper pool debits after successful payouts", () => {
    const source = readFileSync(new URL("../lib/community-pool.ts", import.meta.url), "utf8");
    const functionBody = (startMarker: string, endMarker: string) => {
      const start = source.indexOf(startMarker);
      const end = source.indexOf(endMarker, start + startMarker.length);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    };

    const singleHelperPayout = functionBody(
      "export async function payHelperFromPool",
      "/** One helper's share",
    );
    const splitHelperPayout = functionBody(
      "export async function payHelpersFromPool",
      "/** Has the pool fronted",
    );

    expect(singleHelperPayout).toMatch(/if \(outcome === "paid"\)[\s\S]*?maybeAlertLowBalance\(\)/);
    expect(splitHelperPayout).toMatch(/if \(outcome === "paid"\)[\s\S]*?maybeAlertLowBalance\(\)/);
  });
});