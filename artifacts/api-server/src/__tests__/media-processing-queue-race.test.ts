import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { enqueueMediaAssetProcessing as EnqueueMediaAssetProcessing } from "../lib/mediaProcessingQueue.js";

const state = { assetStatus: "pending" };
const order: string[] = [];
let selectResults: unknown[][] = [];
const queueAdd = jest.fn(async () => {
  state.assetStatus = "ready";
  order.push("worker-ready");
});

const mockDb = {
  update: jest.fn(() => ({
    set: jest.fn((values: { status: string }) => {
      state.assetStatus = values.status;
      order.push("asset-processing");
      return {
        where: jest.fn(() => ({
          returning: jest.fn(async () => [{ id: 42 }]),
        })),
      };
    }),
  })),
  insert: jest.fn(() => ({
    values: jest.fn(() => ({
      onConflictDoNothing: jest.fn(async () => undefined),
    })),
  })),
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          then: (resolve: (results: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(selectResults.shift() ?? []).then(resolve, reject),
          for: jest.fn(async (lock: string) => {
            order.push(`story-${lock}`);
            return selectResults.shift() ?? [];
          }),
        })),
      })),
    })),
  })),
  transaction: jest.fn(async (callback: (transaction: unknown) => Promise<unknown>) => callback(mockDb)),
};

jest.unstable_mockModule("../lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let enqueueMediaAssetProcessing: typeof EnqueueMediaAssetProcessing;

beforeAll(async () => {
  ({ enqueueMediaAssetProcessing } = await import("../lib/mediaProcessingQueue.js"));
});

beforeEach(() => {
  state.assetStatus = "pending";
  order.length = 0;
  queueAdd.mockClear();
  mockDb.update.mockClear();
  mockDb.transaction.mockClear();
  selectResults = [[{ context_kind: "direct", context_id: 7 }]];
});

describe("media job enqueue state transition", () => {
  it("does not overwrite a fast worker's ready status after publishing", async () => {
    const result = await enqueueMediaAssetProcessing(
      42,
      "document",
      null,
      { add: queueAdd } as never,
      mockDb as never,
    );

    expect(result).toBe(true);
    expect(state.assetStatus).toBe("ready");
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["asset-processing", "worker-ready"]);
  });

  it("locks the Story before transitioning its media asset", async () => {
    selectResults = [
      [{ context_kind: "story", context_id: 77 }],
      [{ status: "published" }],
    ];
    const result = await enqueueMediaAssetProcessing(
      42,
      "document",
      null,
      { add: queueAdd } as never,
      mockDb as never,
    );

    expect(result).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["story-share", "asset-processing", "worker-ready"]);
  });

  it("rejects a deletion-pending Story before updating or publishing", async () => {
    selectResults = [
      [{ context_kind: "story", context_id: 77 }],
      [{ status: "deletion_pending" }],
    ];
    const result = await enqueueMediaAssetProcessing(
      42,
      "document",
      null,
      { add: queueAdd } as never,
      mockDb as never,
    );

    expect(result).toBe(false);
    expect(order).toEqual(["story-share"]);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("rejects an absent Story after taking the Story lock", async () => {
    selectResults = [
      [{ context_kind: "story", context_id: 77 }],
      [],
    ];
    const result = await enqueueMediaAssetProcessing(
      42,
      "document",
      null,
      { add: queueAdd } as never,
      mockDb as never,
    );

    expect(result).toBe(false);
    expect(order).toEqual(["story-share"]);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});