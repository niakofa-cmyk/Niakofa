import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
  enqueueMediaAssetProcessing as EnqueueMediaAssetProcessing,
  enqueuePendingMediaAssetThumbnail as EnqueuePendingMediaAssetThumbnail,
  regenerateMediaAssetThumbnail as RegenerateMediaAssetThumbnail,
} from "../lib/mediaProcessingQueue.js";

const state = { assetStatus: "pending" };
const order: string[] = [];
let selectResults: unknown[][] = [];
const queueAdd = jest.fn(async (_name?: string, _data?: unknown, _options?: unknown) => {
  if (_name !== "thumbnail") {
    state.assetStatus = "ready";
    order.push("worker-ready");
  }
});

const mockDb = {
  update: jest.fn(() => ({
    set: jest.fn((values: { status?: string }) => {
      if (values.status && values.status !== "queued") {
        state.assetStatus = values.status;
        order.push("asset-processing");
      }
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
  select: jest.fn(() => {
    const query = {
      innerJoin: jest.fn(() => query),
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
    };
    return { from: jest.fn(() => query) };
  }),
  transaction: jest.fn(async (callback: (transaction: unknown) => Promise<unknown>) => callback(mockDb)),
};

jest.unstable_mockModule("../lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let enqueueMediaAssetProcessing: typeof EnqueueMediaAssetProcessing;
let regenerateMediaAssetThumbnail: typeof RegenerateMediaAssetThumbnail;
let enqueuePendingMediaAssetThumbnail: typeof EnqueuePendingMediaAssetThumbnail;

beforeAll(async () => {
  ({ enqueueMediaAssetProcessing, regenerateMediaAssetThumbnail, enqueuePendingMediaAssetThumbnail } = await import("../lib/mediaProcessingQueue.js"));
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

  it("regenerates a video cover without taking an already-ready asset out of service", async () => {
    state.assetStatus = "ready";
    selectResults = [
      [{ id: 42, media_type: "video", status: "ready" }],
      [{ updatedAt: new Date(123) }],
      [{ updatedAt: new Date(123456789) }],
    ];

    const result = await regenerateMediaAssetThumbnail(42, { add: queueAdd } as never, mockDb as never);

    expect(result).toBe(true);
    expect(state.assetStatus).toBe("ready");
    expect(queueAdd).toHaveBeenCalledWith(
      "thumbnail",
      { mediaAssetId: 42, jobType: "thumbnail" },
      { jobId: expect.stringMatching(/^media-42-thumbnail-cover-\d+$/) },
    );
  });

  it("does not queue a cover job for media that is no longer ready", async () => {
    selectResults = [[{ id: 42, media_type: "video", status: "processing" }]];

    const result = await regenerateMediaAssetThumbnail(42, { add: queueAdd } as never, mockDb as never);

    expect(result).toBe(false);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("replays the stable queued thumbnail job after an idempotent publish retry", async () => {
    const updatedAt = new Date(123456789);
    const database = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => [{ updatedAt }] }),
          }),
        }),
      }),
    };

    const result = await enqueuePendingMediaAssetThumbnail(42, { add: queueAdd } as never, database as never);

    expect(result).toBe(true);
    expect(queueAdd).toHaveBeenCalledWith(
      "thumbnail",
      { mediaAssetId: 42, jobType: "thumbnail" },
      { jobId: "media-42-thumbnail-cover-123456789" },
    );
  });

  it("requeues a failed cover job with a new durable job id", async () => {
    let requeuedAt: Date | null = null;
    const database = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [{ id: 9, status: "failed", updatedAt: new Date(123) }],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (values: { updated_at: Date }) => {
          requeuedAt = values.updated_at;
          return {
            where: () => ({
              returning: async () => [{ updatedAt: requeuedAt }],
            }),
          };
        },
      }),
    };

    const result = await enqueuePendingMediaAssetThumbnail(42, { add: queueAdd } as never, database as never);

    expect(result).toBe(true);
    expect(requeuedAt).toBeInstanceOf(Date);
    expect(queueAdd).toHaveBeenCalledWith(
      "thumbnail",
      { mediaAssetId: 42, jobType: "thumbnail" },
      { jobId: `media-42-thumbnail-cover-${requeuedAt!.getTime()}` },
    );
  });
});