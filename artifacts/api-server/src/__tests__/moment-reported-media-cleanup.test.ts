import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mediaStorageKeys } from "../lib/media-cleanup";
import { deleteMomentAfterStrictMediaCleanup } from "../lib/moment-media-cleanup";

const table = (name: string) => ({ name });
const reportsTable = table("reports");
const usersTable = table("users");
const griotStoriesTable = table("griot_stories");
const communityStoriesTable = table("community_stories");
const exchangeListingsTable = table("exchange_listings");
const exchangeModerationReviewHistoryTable = table("exchange_moderation_review_history");

let reportStatus = "pending";
let storyUpdates: Array<Record<string, unknown>>;
let reportUpdates: Array<Record<string, unknown>>;

const db = {
  update: jest.fn((target: unknown) => {
    let changes: Record<string, unknown> = {};
    return {
      set(values: Record<string, unknown>) {
        changes = values;
        return this;
      },
      where() {
        if (target === reportsTable && reportUpdates.length === 0) {
          reportStatus = String(changes.status);
          reportUpdates.push(changes);
          return {
            returning: async () => [{
              id: 91,
              reporter_id: 12,
              reported_community_story_id: 44,
              reported_user_id: null,
              reported_griot_story_id: null,
              reported_exchange_listing_id: null,
              status: reportStatus,
            }],
          };
        }
        if (target === reportsTable) {
          reportUpdates.push(changes);
          return { returning: async () => [] };
        }
        if (target === communityStoriesTable) storyUpdates.push(changes);
        return Promise.resolve([]);
      },
    };
  }),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  reportsTable,
  usersTable,
  griotStoriesTable,
  communityStoriesTable,
  exchangeListingsTable,
  exchangeModerationReviewHistoryTable,
}));
jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn((...args: unknown[]) => args),
  and: jest.fn((...args: unknown[]) => args),
  desc: jest.fn((...args: unknown[]) => args),
  sql: Object.assign(jest.fn(() => ({})), { join: jest.fn(), raw: jest.fn() }),
  inArray: jest.fn((...args: unknown[]) => args),
  isNotNull: jest.fn((...args: unknown[]) => args),
}));
jest.unstable_mockModule("drizzle-orm/pg-core", () => ({
  alias: jest.fn((source: unknown) => source),
}));
jest.unstable_mockModule("../middlewares/auth.js", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { authenticatedUserId: number }).authenticatedUserId = 7;
    next();
  },
}));
jest.unstable_mockModule("../middlewares/authz.js", () => ({
  requireAdmin: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.unstable_mockModule("../middlewares/rate-limit.js", () => ({
  adminLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.unstable_mockModule("../lib/ws-hub.js", () => ({ broadcast: jest.fn() }));
jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule("../lib/message-notifications.js", () => ({
  createMessageNotification: jest.fn(),
}));
jest.unstable_mockModule("../routes/community-stories.js", () => ({
  viewerCanReadStory: jest.fn(),
}));

let reportsRouter: express.Router;

beforeAll(async () => {
  ({ default: reportsRouter } = await import("../routes/reports.js"));
});

beforeEach(() => {
  reportStatus = "pending";
  storyUpdates = [];
  reportUpdates = [];
  jest.clearAllMocks();
});

function app() {
  return express().use(express.json()).use(reportsRouter);
}

describe("upheld reported Moment media deletion", () => {
  it("strictly deletes legacy and universal keys before removing the row, then retries successfully", async () => {
    const upheld = await request(app())
      .patch("/reports/91/review")
      .send({ status: "resolved_banned" });

    expect(upheld.status).toBe(200);
    expect(storyUpdates).toContainEqual(expect.objectContaining({ status: "removed", expires_at: expect.any(Date) }));

    const asset = {
      id: 702,
      original_key: "media-assets/702/source.mp4",
      thumbnail_key: "media-assets/702/thumb.jpg",
      variant_key: "media-assets/702/processed.mp4",
      cleanup_keys: ["media-assets/702/pending.mp4"],
      metadata: { storage_cleanup_keys: ["media-assets/702/generated.mp4"] },
    };
    const keys = [...new Set([
      "legacy/moments/44/video.mp4",
      "legacy/moments/44/thumbnail.jpg",
      ...mediaStorageKeys(asset),
    ])];
    const failedKey = "media-assets/702/generated.mp4";
    const strictDelete = jest.fn(async (key: string) => {
      if (key === failedKey && strictDelete.mock.calls.filter(([seen]) => seen === failedKey).length === 1) {
        throw new Error("simulated provider outage");
      }
    });
    let rowExists = true;
    const deleteRow = jest.fn(async () => {
      rowExists = false;
    });

    await expect(deleteMomentAfterStrictMediaCleanup(keys, strictDelete, deleteRow))
      .rejects.toThrow("simulated provider outage");
    expect(strictDelete).toHaveBeenCalledWith("legacy/moments/44/video.mp4");
    expect(strictDelete).toHaveBeenCalledWith("legacy/moments/44/thumbnail.jpg");
    expect(strictDelete).toHaveBeenCalledWith("media-assets/702/source.mp4");
    expect(strictDelete).toHaveBeenCalledWith("media-assets/702/generated.mp4");
    expect(deleteRow).not.toHaveBeenCalled();
    expect(rowExists).toBe(true);

    await expect(deleteMomentAfterStrictMediaCleanup(keys, strictDelete, deleteRow)).resolves.toBeUndefined();
    expect(strictDelete.mock.calls.slice(strictDelete.mock.calls.findIndex(([key]) => key === failedKey) + 1).map(([key]) => key))
      .toEqual(keys);
    expect(deleteRow).toHaveBeenCalledTimes(1);
    expect(rowExists).toBe(false);
  });

  it("does not mark a Moment for removal or begin media deletion when a report is not upheld", async () => {
    const response = await request(app())
      .patch("/reports/91/review")
      .send({ status: "resolved_warned" });

    expect(response.status).toBe(200);
    expect(storyUpdates).toHaveLength(0);
    const deleteStorageKey = jest.fn(async () => {});
    const deleteRow = jest.fn(async () => {});
    expect(deleteStorageKey).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
  });
});