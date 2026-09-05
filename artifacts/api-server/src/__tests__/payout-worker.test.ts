import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const stripeTransferCreate = jest.fn();
const stripeTransferList = jest.fn();
const stripeTransferRetrieve = jest.fn();
const broadcast = jest.fn();
const paymentValues: unknown[] = [];
const earningValues: unknown[] = [];
let claimInsertResult: unknown[] = [];
let existingOperation: unknown[] = [];
let completedUpdateResult: unknown[] = [];

const payoutOperationsTable = {
  id: "payout_operation_id",
  request_id: "request_id",
  helper_id: "helper_id",
  requester_id: "requester_id",
  amount_cents: "amount_cents",
  platform_fee_cents: "platform_fee_cents",
  stripe_account_id: "stripe_account_id",
  state: "state",
  stripe_transfer_id: "stripe_transfer_id",
  operation_key: "operation_key",
};
const transactionsTable = { id: "transaction_id" };

function paymentInsertChain() {
  return {
    values: jest.fn((values: unknown) => {
      paymentValues.push(values);
      return {
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(async () => claimInsertResult),
        })),
      };
    }),
  };
}

function earningInsertChain() {
  return {
    values: jest.fn((values: unknown) => {
      earningValues.push(values);
      return {
        onConflictDoNothing: jest.fn(async () => undefined),
      };
    }),
  };
}

const tx = {
  insert: jest.fn((table: unknown) =>
    table === payoutOperationsTable ? paymentInsertChain() : earningInsertChain()),
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(async () => existingOperation),
      })),
    })),
  })),
  update: jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(async () => completedUpdateResult),
      })),
    })),
  })),
};

const db = {
  transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
  insert: jest.fn(),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  payoutOperationsTable,
  transactionsTable,
}));

jest.unstable_mockModule("stripe", () => ({
  default: class StripeMock {
    transfers = {
      create: stripeTransferCreate,
      list: stripeTransferList,
      retrieve: stripeTransferRetrieve,
    };
  },
}));

jest.unstable_mockModule("bullmq", () => ({
  Worker: class WorkerMock {
    on = jest.fn();
  },
}));

jest.unstable_mockModule("../lib/queue", () => ({
  getRedisConnection: jest.fn(),
  QUEUE: { PAYOUTS: "payouts" },
}));

jest.unstable_mockModule("../lib/ws-hub", () => ({ broadcast }));
jest.unstable_mockModule("../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule("../lib/stripe-config", () => ({
  getStripeSecretKey: () => "sk_test_offline",
}));
jest.unstable_mockModule("../lib/worker-lifecycle", () => ({ trackWorker: jest.fn() }));
jest.unstable_mockModule("drizzle-orm", () => ({
  and: jest.fn((...conditions: unknown[]) => conditions),
  eq: jest.fn((left: unknown, right: unknown) => [left, right]),
}));

let processPayout: (job: unknown) => Promise<void>;

beforeAll(async () => {
  ({ processPayout } = await import("../workers/payout-worker"));
});

beforeEach(() => {
  jest.clearAllMocks();
  paymentValues.length = 0;
  earningValues.length = 0;
  claimInsertResult = [{
    id: 1,
    state: "authorized",
    request_id: 10,
    helper_id: 20,
    requester_id: 30,
    amount_cents: 10000,
    platform_fee_cents: 500,
    stripe_account_id: "acct_test",
    stripe_transfer_id: null,
  }];
  existingOperation = [];
  completedUpdateResult = [{ id: 1 }];
  stripeTransferCreate.mockResolvedValue({ id: "tr_restart_safe" });
  stripeTransferList.mockResolvedValue({ data: [] });
  stripeTransferRetrieve.mockResolvedValue({ id: "tr_restart_safe" });
});

const job = {
  data: {
    request_id: 10,
    helper_id: 20,
    requester_id: 30,
    amount_cents: 10000,
    platform_fee_cents: 500,
    stripe_account_id: "acct_test",
    request_title: "Restart-safe help",
  },
  attemptsMade: 1,
};

describe("payout worker restart idempotency", () => {
  it("records the Stripe transfer and helper history with a stable operation key", async () => {
    await processPayout(job);

    expect(paymentValues).toHaveLength(1);
    expect(stripeTransferCreate).toHaveBeenCalledTimes(1);
    expect(earningValues).toEqual([
      expect.objectContaining({
        idempotency_key: "payout-10-20",
        amount: 95,
      }),
    ]);
  });

  it("uses an identical Stripe payload when a payout job is retried", async () => {
    await processPayout(job);
    await processPayout({ ...job, attemptsMade: 2 });

    expect(stripeTransferCreate).toHaveBeenCalledTimes(2);
    const [firstParams, firstOptions] = stripeTransferCreate.mock.calls[0];
    const [retryParams, retryOptions] = stripeTransferCreate.mock.calls[1];
    expect(retryParams).toEqual(firstParams);
    expect(retryOptions).toEqual(firstOptions);
    expect(firstParams).toEqual(expect.not.objectContaining({
      metadata: expect.objectContaining({ attempt: expect.anything() }),
    }));
  });

  it("repairs missing helper history without duplicating the completed payment", async () => {
    claimInsertResult = [];
    existingOperation = [{
      id: 1,
      state: "completed",
      request_id: 10,
      helper_id: 20,
      requester_id: 30,
      amount_cents: 10000,
      platform_fee_cents: 500,
      stripe_account_id: "acct_test",
      stripe_transfer_id: "tr_restart_safe",
    }];

    await processPayout(job);

    expect(stripeTransferRetrieve).toHaveBeenCalledWith("tr_restart_safe");
    expect(stripeTransferCreate).not.toHaveBeenCalled();
    expect(earningValues).toEqual([
      expect.objectContaining({ idempotency_key: "payout-10-20" }),
    ]);
  });

  it("reconciles an earlier Stripe transfer after a crash without creating another", async () => {
    claimInsertResult = [];
    existingOperation = [{
      id: 1,
      state: "authorized",
      request_id: 10,
      helper_id: 20,
      requester_id: 30,
      amount_cents: 10000,
      platform_fee_cents: 500,
      stripe_account_id: "acct_test",
      stripe_transfer_id: null,
    }];
    stripeTransferList.mockResolvedValue({
      data: [{
        id: "tr_restart_safe",
        destination: "acct_test",
        amount: 9500,
        currency: "usd",
        metadata: {
          request_id: "10",
          helper_id: "20",
          operation_key: "payout-10-20",
          platform_fee_cents: "500",
        },
      }],
    });

    await processPayout(job);

    expect(stripeTransferCreate).not.toHaveBeenCalled();
    expect(earningValues).toHaveLength(1);
  });

  it("fails closed when the durable operation belongs to another helper", async () => {
    claimInsertResult = [];
    existingOperation = [{
      id: 1,
      state: "authorized",
      request_id: 10,
      helper_id: 99,
      requester_id: 30,
      amount_cents: 10000,
      platform_fee_cents: 500,
      stripe_account_id: "acct_test",
      stripe_transfer_id: null,
    }];

    await expect(processPayout(job)).rejects.toThrow("identity conflict");
    expect(earningValues).toHaveLength(0);
  });
});