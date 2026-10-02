import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/community-hub-feed.ts", import.meta.url);

describe("Hub Community post deletion", () => {
  it("scopes deletion to the authenticated author and hides the post before cleanup", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const deletion = route.slice(route.indexOf('router.delete("/community/hubs/:hubId/posts/:postId"'));

    expect(deletion).toMatch(/requireAuth, requireApproved, communityPostLimiter/);
    expect(deletion).toMatch(/eq\(hubCommunityPostsTable\.author_id, req\.authenticatedUserId!\)/);
    expect(deletion).toMatch(/\.for\("update"\)/);
    expect(deletion).toMatch(/moderation_status: "deletion_pending"/);
    expect(deletion).toMatch(/status: "deleted"[\s\S]*storage_cleanup_pending/);
  });

  it("cancels processing, strictly removes original and generated objects, and retains a retryable tombstone on failure", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const deletion = route.slice(route.indexOf('router.delete("/community/hubs/:hubId/posts/:postId"'));

    expect(deletion).toMatch(/status: "cancelled"[\s\S]*MEDIA_ASSET_DELETED/);
    expect(deletion).toMatch(/mediaStorageKeys\(asset\)/);
    expect(deletion).toMatch(/Promise\.allSettled\(storageKeys\.map\(\(key\) => deleteAssetStrict\(key\)\)\)/);
    expect(deletion).toMatch(/HUB_POST_MEDIA_CLEANUP_INCOMPLETE/);
    expect(deletion).toMatch(/await db\.delete\(hubCommunityPostsTable\)/);
    expect(deletion).toMatch(/hub_community_post_updated[\s\S]*change: "deleted"/);
  });

  it("serializes attachment commits with deletion and rejects uploads to a tombstoned post", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const upload = route.slice(
      route.indexOf('router.post("/community/hubs/:hubId/posts/:postId/media"'),
      route.indexOf('router.delete("/community/hubs/:hubId/posts/:postId"'),
    );

    expect(upload).toMatch(/\.for\("share"\)/);
    expect(upload).toMatch(/lockedPost\.moderation_status !== "approved"/);
    expect(upload).toMatch(/deleteAssetStrict\(storageKey\)/);
    expect(upload).toMatch(/HUB_POST_UNAVAILABLE/);
  });
});