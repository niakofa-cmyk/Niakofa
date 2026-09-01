import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
  markPoolSettlementPaidOut as MarkPoolSettlementPaidOut,
  PoolSettlementTransitionError as PoolSettlementTransitionErrorType,
} from "../lib/mark-pool-settlement-paid-out.js";

const chain: Record<string, jest.Mock> = {};
for (const method of ["from", "where", "limit", "set", "values"]) {
  chain[method] = jest.fn(() => chain);
}

const tx = {
  execute: jest.fn(),
  update: jest.fn(() => chain),
  insert: jest.fn(() => chain),
};
const mockDb = {
  select: jest.fn(() => chain),
  transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  communityPoolFinancialEventsTable: {
    id: "id",
    stripe_balance_transaction_id: "stripe_balance_transaction_id",
    gross_amount_cents: "gross_amount_cents",
    stripe_fee_cents: "stripe_fee_cents",
    net_amount_cents: "net_amount_cents",
    currency: "currency",
  },
  communityPoolFinancialAuditEventsTable: {},
}));
jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(),
  sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));
jest.unstable_mockModule("../lib/community-pool.js", () => ({
  getPoolBalance: jest.fn().mockResolvedValue(123.45),
}));
jest.unstable_mockModule("../lib/ws-hub.js", () => ({ broadcast: jest.fn() }));
jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

let markPoolSettlementPaidOut: typeof MarkPoolSettlementPaidOut;
let PoolSettlementTransitionError: typeof PoolSettlementTransitionErrorType;

const availableVerifiedRow = {
  id: 7,
  stripe_verification_status: "verified",
  settlement_status: "available",
  stripe_balance_transaction_id: "txn_7",
  gross_amount_cents: 1000,
  stripe_fee_cents: 50,
  net_amount_cents: 950,
  currency: "usd",
  user_id: 22,
  community_pool_ledger_id: 33,
};

beforeAll(async () => {
  ({ markPoolSettlementPaidOut, PoolSettlementTransitionError } =
    await import("../lib/mark-pool-settlement-paid-out.js"));
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const method of ["from", "where", "limit", "set", "values"]) {
    chain[method].mockImplementation(() => chain);
  }
  chain.limit.mockResolvedValue([]);
  tx.execute.mockResolvedValue({ rows: [availableVerifiedRow] });
});

describe("markPoolSettlementPaidOut", () => {
  it("rejects missing payout references before any mutation", async () => {
    await expect(markPoolSettlementPaidOut({
      financialEventId: 7,
      operatorId: 99,
      payoutReference: " ",
    })).rejects.toMatchObject({ code: "reference_required" });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects an unverified settlement", async () => {
    tx.execute.mockResolvedValueOnce({
      rows: [{ ...availableVerifiedRow, stripe_verification_status: "unverified" }],
    });
    await expect(markPoolSettlementPaidOut({
      financialEventId: 7,
      operatorId: 99,
      payoutReference: "transfer-7",
    })).rejects.toMatchObject({ code: "not_verified" });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects a verified settlement that is still pending", async () => {
    tx.execute.mockResolvedValueOnce({
      rows: [{ ...availableVerifiedRow, settlement_status: "pending" }],
    });
    await expect(markPoolSettlementPaidOut({
      financialEventId: 7,
      operatorId: 99,
      payoutReference: "transfer-7",
    })).rejects.toMatchObject({ code: "not_available" });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("transitions once and records the operator audit event", async () => {
    chain.values.mockResolvedValue([]);
    const result = await markPoolSettlementPaidOut({
      financialEventId: 7,
      operatorId: 99,
      payoutReference: "transfer-7",
      note: "Weekly pool batch",
    });

    expect(result).toMatchObject({
      id: 7,
      settlementStatus: "paid_out",
      paidOutBy: 99,
      paidOutReference: "transfer-7",
    });
    expect(tx.update).toHaveBeenCalledWith(expect.anything());
    expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({
      settlement_status: "paid_out",
      paid_out_by: 99,
      paid_out_reference: "transfer-7",
    }));
    expect(tx.insert).toHaveBeenCalledWith(expect.anything());
    expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({
      financial_event_id: 7,
      action: "marked_paid_out",
      actor_user_id: 99,
      reference: "transfer-7",
    }));
  });

  it("does not allow a second payout", async () => {
    tx.execute.mockResolvedValueOnce({
      rows: [{ ...availableVerifiedRow, settlement_status: "paid_out" }],
    });
    let error: unknown;
    try {
      await markPoolSettlementPaidOut({
        financialEventId: 7,
        operatorId: 99,
        payoutReference: "transfer-duplicate",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PoolSettlementTransitionError);
    expect(error).toMatchObject({ code: "already_paid_out" });
    expect(tx.insert).not.toHaveBeenCalled();
  });
});