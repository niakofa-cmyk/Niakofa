import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const governmentConnectedPayoutsTable = { id: "payout_id" };
const governmentFundingTransferLinksTable = { id: "link_id" };
const governmentRequestFundingTable = { id: "funding_id" };
const governmentTransferBankPayoutsTable = { id: "bank_link_id" };
const payoutOperationsTable = { id: "operation_id" };

let operation: Record<string, unknown>;
let allocations: Record<string, unknown>[];
let transferLinks: Record<string, unknown>[];
let priorPayoutMappings: Record<string, unknown>[];
const insertedLinks: Record<string, unknown>[] = [];
const insertedBankLinks: Record<string, unknown>[] = [];
const stripeBalanceTransactionList = jest.fn();

function queryBuilder(table: unknown) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder["where"] = () => builder;
  builder["for"] = () => builder;
  builder["orderBy"] = () => builder;
  builder["innerJoin"] = () => builder;
  builder["limit"] = async () => table === payoutOperationsTable ? [operation] : [];
  builder["then"] = (resolve, reject) => {
    const rows = table === governmentRequestFundingTable
      ? allocations
      : table === governmentFundingTransferLinksTable
        ? transferLinks
        : table === governmentTransferBankPayoutsTable
          ? priorPayoutMappings
        : [];
    return Promise.resolve(rows).then(resolve as (value: unknown) => unknown, reject as (reason: unknown) => unknown);
  };
  return builder;
}

const tx = {
  select: jest.fn(() => ({
    from: (table: unknown) => queryBuilder(table),
  })),
  insert: jest.fn((table: unknown) => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoNothing: async () => {
        if (table === governmentFundingTransferLinksTable) insertedLinks.push(values);
        if (table === governmentTransferBankPayoutsTable) insertedBankLinks.push(values);
      },
      onConflictDoUpdate: () => ({
        returning: async () => [{ id: 41 }],
      }),
    }),
  })),
};

const db = {
  transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  select: jest.fn(() => ({
    from: (table: unknown) => queryBuilder(table),
  })),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  governmentConnectedPayoutsTable,
  governmentFundingTransferLinksTable,
  governmentRequestFundingTable,
  governmentTransferBankPayoutsTable,
  payoutOperationsTable,
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  asc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => [left, right],
  inArray: (left: unknown, right: unknown) => [left, right],
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

jest.unstable_mockModule("../lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

let recordGovernmentFundingTransfer: typeof import("../lib/government-funding-reconciliation").recordGovernmentFundingTransfer;
let recordGovernmentConnectedPayout: typeof import("../lib/government-funding-reconciliation").recordGovernmentConnectedPayout;

beforeAll(async () => {
  const reconciliation = await import("../lib/government-funding-reconciliation");
  recordGovernmentFundingTransfer = reconciliation.recordGovernmentFundingTransfer;
  recordGovernmentConnectedPayout = reconciliation.recordGovernmentConnectedPayout;
});

beforeEach(() => {
  jest.clearAllMocks();
  insertedLinks.length = 0;
  insertedBankLinks.length = 0;
  transferLinks = [];
  priorPayoutMappings = [];
  allocations = [{ id: 7, amount: "95.00" }];
  operation = {
    id: 8,
    operation_key: "payout-17-22",
    request_id: 17,
    helper_id: 22,
    amount_cents: 10000,
    platform_fee_cents: 500,
    stripe_account_id: "acct_helper",
    stripe_transfer_id: "tr_exact",
  };
});

describe("government funding transfer and bank payout reconciliation", () => {
  it("links an existing transfer only when it matches its durable payout operation", async () => {
    await recordGovernmentFundingTransfer({
      id: "tr_exact",
      amount: 9500,
      currency: "usd",
      destination: "acct_helper",
      destination_payment: "py_exact",
      livemode: false,
      metadata: { operation_key: "payout-17-22", request_id: "17", helper_id: "22" },
    } as never);
    expect(insertedLinks).toEqual([expect.objectContaining({
      request_funding_id: 7,
      payout_operation_id: 8,
      stripe_transfer_id: "tr_exact",
      stripe_destination_payment_id: "py_exact",
      linked_amount_cents: 9500,
    })]);

    insertedLinks.length = 0;
    await recordGovernmentFundingTransfer({
      id: "tr_wrong_amount",
      amount: 9400,
      currency: "usd",
      destination: "acct_helper",
      destination_payment: "py_wrong",
      livemode: false,
      metadata: { operation_key: "payout-17-22", request_id: "17", helper_id: "22" },
    } as never);
    expect(insertedLinks).toHaveLength(0);
  });

  it("maps a bank payout only from an exact transfer or destination-payment source ID", async () => {
    transferLinks = [{
      id: 12,
      stripe_account_id: "acct_helper",
      stripe_transfer_id: "tr_exact",
      stripe_destination_payment_id: "py_exact",
      linked_amount_cents: 9500,
      reversed_amount_cents: 0,
    }];
    stripeBalanceTransactionList.mockResolvedValue({
      data: [
        { id: "txn_exact", amount: 9500, source: "py_exact" },
        { id: "txn_ambiguous", amount: 9500, source: "ch_unrelated" },
      ],
      has_more: false,
    });
    const stripe = {
      balanceTransactions: { list: stripeBalanceTransactionList },
    };

    await recordGovernmentConnectedPayout(
      stripe as never,
      "evt_payout_paid",
      false,
      "acct_helper",
      {
        id: "po_helper",
        amount: 9500,
        currency: "usd",
        status: "paid",
        arrival_date: 1_800_000_000,
      } as never,
    );

    expect(stripeBalanceTransactionList).toHaveBeenCalledWith(
      { payout: "po_helper", limit: 100 },
      { stripeAccount: "acct_helper" },
    );
    expect(insertedBankLinks).toEqual([expect.objectContaining({
      transfer_link_id: 12,
      connected_payout_id: 41,
      stripe_balance_transaction_id: "txn_exact",
      linked_amount_cents: 9500,
    })]);
  });

  it("does not attribute the same helper transfer twice across separate bank payouts", async () => {
    transferLinks = [{
      id: 12,
      stripe_account_id: "acct_helper",
      stripe_transfer_id: "tr_exact",
      stripe_destination_payment_id: "py_exact",
      linked_amount_cents: 9500,
      reversed_amount_cents: 0,
    }];
    priorPayoutMappings = [{
      transfer_link_id: 12,
      connected_payout_id: 30,
      linked_amount_cents: 4000,
      status: "paid",
    }];
    stripeBalanceTransactionList.mockResolvedValue({
      data: [{ id: "txn_exact", amount: 9500, source: "tr_exact" }],
      has_more: false,
    });

    await recordGovernmentConnectedPayout(
      { balanceTransactions: { list: stripeBalanceTransactionList } } as never,
      "evt_second_payout",
      false,
      "acct_helper",
      {
        id: "po_second",
        amount: 9500,
        currency: "usd",
        status: "paid",
        arrival_date: 1_800_000_000,
      } as never,
    );

    expect(insertedBankLinks).toEqual([expect.objectContaining({
      transfer_link_id: 12,
      connected_payout_id: 41,
      linked_amount_cents: 5500,
    })]);
  });
});
