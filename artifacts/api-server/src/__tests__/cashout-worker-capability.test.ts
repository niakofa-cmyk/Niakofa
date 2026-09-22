import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const transferCreate = jest.fn();
const broadcast = jest.fn();
const restoredWalletValues: unknown[] = [];
const ledgerValues: unknown[] = [];
let selectResults: unknown[][] = [];

const walletCashoutsTable = { id: "cashout_id", state: "state" };
const usersTable = { id: "user_id", benevolence_wallet: "benevolence_wallet" };
const transactionsTable = { id: "transaction_id" };

const tx = {
  update: jest.fn((table: unknown) => ({
    set: jest.fn((values: unknown) => {
      if (table === usersTable) restoredWalletValues.push(values);
      return {
        where: jest.fn(() =>
          table === walletCashoutsTable
            ? { returning: jest.fn(async () => [{ id: 7 }]) }
            : Promise.resolve(undefined)),
      };
    }),
  })),
  insert: jest.fn(() => ({
    values: jest.fn(async (values: unknown) => {
      ledgerValues.push(values);
    }),
  })),
};

const db = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(async () => selectResults.shift() ?? []),
      })),
    })),
  })),
  transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
  update: jest.fn(),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  walletCashoutsTable,
  usersTable,
  transactionsTable,
}));
jest.unstable_mockModule("stripe", () => ({
  default: class StripeMock {
    transfers = { create: transferCreate };
  },
}));
jest.unstable_mockModule("bullmq", () => ({
  Worker: class WorkerMock {
    on = jest.fn();
  },
}));
jest.unstable_mockModule("../lib/queue", () => ({
  getRedisConnection: jest.fn(),
  QUEUE: { WALLET_CASHOUTS: "wallet-cashouts" },
}));
jest.unstable_mockModule("../lib/ws-hub", () => ({ broadcast }));
jest.unstable_mockModule("../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule("../lib/stripe-config", () => ({
  getStripeSecretKey: () => "sk_test_offline",
}));
jest.unstable_mockModule("../lib/stripe-cashout", () => ({
  buildCashoutTransferParams: jest.fn(() => ({
    amount: 500,
    currency: "usd",
    destination: "acct_recipient",
  })),
  cashoutIdempotencyKey: jest.fn(() => "cashout-7"),
}));
jest.unstable_mockModule("../lib/worker-lifecycle", () => ({ trackWorker: jest.fn() }));
jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn((left: unknown, right: unknown) => [left, right]),
  sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

let processCashout: (job: unknown) => Promise<void>;

beforeAll(async () => {
  ({ processCashout } = await import("../workers/cashout-worker"));
});

beforeEach(() => {
  jest.clearAllMocks();
  restoredWalletValues.length = 0;
  ledgerValues.length = 0;
  selectResults = [
    [{ state: "pending" }],
    [{ state: "pending", stripe_transfer_id: null }],
  ];
});

describe("cashout worker recipient capability handling", () => {
  it("discards retries and restores the reserved wallet exactly once", async () => {
    const capabilityError = Object.assign(
      new Error("recipient capability missing"),
      { code: "insufficient_capabilities_for_transfer" },
    );
    transferCreate.mockRejectedValueOnce(capabilityError);
    const job = {
      data: {
        cashout_id: 7,
        user_id: 20,
        amount_cents: 500,
        stripe_account_id: "acct_recipient",
      },
      attemptsMade: 1,
      opts: { attempts: 5 },
      discard: jest.fn(),
    };

    await expect(processCashout(job)).rejects.toBe(capabilityError);

    expect(job.discard).toHaveBeenCalledTimes(1);
    expect(transferCreate).toHaveBeenCalledTimes(1);
    expect(restoredWalletValues).toHaveLength(1);
    expect(ledgerValues).toEqual([
      expect.objectContaining({ type: "goodwill", amount: 5 }),
    ]);
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "wallet_cashout_reversed" }),
    );
  });
});