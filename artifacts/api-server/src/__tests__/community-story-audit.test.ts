import { readFileSync } from "node:fs";
import {
  buildCommunityStoryAuditEvent,
  type CommunityStoryAuditInput,
} from "../lib/community-story-audit";

const storyRoutes = readFileSync(new URL("../routes/community-stories.ts", import.meta.url), "utf8");
const createRouteStart = storyRoutes.indexOf('router.post("/community/stories"');
const deleteRouteStart = storyRoutes.indexOf('router.delete("/community/stories/:id"');
const mediaRouteStart = storyRoutes.indexOf('router.get("/community/stories/media/:id"');
const createRoute = storyRoutes.slice(createRouteStart, mediaRouteStart);
const deleteRoute = storyRoutes.slice(deleteRouteStart);

describe("Community Story lifecycle audit events", () => {
  it("keeps the structured event allowlisted even if content fields are present at runtime", () => {
    const unsafeInput = {
      action: "created",
      actorUserId: 17,
      storyId: 29,
      storyStatus: "published",
      caption: "private story caption",
      mediaUrl: "https://private.example/media",
      storageKey: "private/object/key",
    } as unknown as CommunityStoryAuditInput;

    const event = buildCommunityStoryAuditEvent(unsafeInput);
    expect(event).toEqual({
      event: "community_story.audit",
      action: "created",
      actor_user_id: 17,
      story_id: 29,
      story_status: "published",
    });
    expect(Object.keys(event).some((key) => /caption|media|storage|url/i.test(key))).toBe(false);
  });

  it("records deletion false outcomes with a reason and true outcomes explicitly", () => {
    expect(buildCommunityStoryAuditEvent({
      action: "delete_result",
      actorUserId: 17,
      storyId: 29,
      deleted: false,
      reason: "storage_cleanup_failed",
    })).toEqual({
      event: "community_story.audit",
      action: "delete_result",
      actor_user_id: 17,
      story_id: 29,
      deleted: false,
      reason: "storage_cleanup_failed",
    });

    expect(buildCommunityStoryAuditEvent({
      action: "delete_result",
      actorUserId: 17,
      storyId: 29,
      deleted: true,
    })).toEqual({
      event: "community_story.audit",
      action: "delete_result",
      actor_user_id: 17,
      story_id: 29,
      deleted: true,
    });

    const unsafeReason = {
      action: "delete_result",
      actorUserId: 17,
      storyId: 29,
      deleted: false,
      reason: "private/object/key",
    } as unknown as CommunityStoryAuditInput;
    expect(buildCommunityStoryAuditEvent(unsafeReason)).toEqual({
      event: "community_story.audit",
      action: "delete_result",
      actor_user_id: 17,
      story_id: 29,
      deleted: false,
      reason: "unknown",
    });
  });

  it("audits newly committed Stories before media queue work and labels idempotent replays", () => {
    expect(createRoute).toMatch(/logger\.info\(buildCommunityStoryAuditEvent\(\{\s*action: "created"/);
    expect(createRoute).toContain("storyStatus: result.story.status");
    expect(createRoute.match(/action: "publish_replayed"/g)).toHaveLength(4);

    const transactionIndex = createRoute.indexOf("const result = await db.transaction");
    const createdAuditIndex = createRoute.indexOf('action: "created"');
    const mediaQueueIndex = createRoute.indexOf("enqueueMediaAssetProcessing");
    expect(createdAuditIndex).toBeGreaterThan(transactionIndex);
    expect(createdAuditIndex).toBeLessThan(mediaQueueIndex);
  });

  it("logs every delete outcome using the actual row-delete result", () => {
    expect(deleteRoute.match(/action: "delete_result"/g)).toHaveLength(6);
    expect(deleteRoute).toContain('reason: "not_found_or_not_owned"');
    expect(deleteRoute).toContain('reason: "media_processing"');
    expect(deleteRoute).toContain('reason: "storage_cleanup_failed"');
    expect(deleteRoute).toContain('reason: "row_missing_after_cleanup"');
    expect(deleteRoute).toContain('reason: "row_cleanup_failed"');
    expect(deleteRoute).toContain("deleted: true");
    expect(deleteRoute).toContain("deleted: false");
  });
});