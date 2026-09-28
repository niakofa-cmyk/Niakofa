import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/media-assets-v21.ts", import.meta.url);
const workerPath = new URL("../workers/media-process-worker.ts", import.meta.url);
const schedulerPath = new URL("../lib/scheduler.ts", import.meta.url);
const storyRoutePath = new URL("../routes/community-stories.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0178_media_asset_moment_contexts.sql", import.meta.url);

describe("V21 media asset deletion safety", () => {
  it("requires authentication and scopes deletion to the asset owner", async () => {
    const route = await fs.readFile(routePath, "utf8");
    expect(route).toMatch(/router\.delete\("\/media-assets\/:id", requireAuth, requireApproved, generalApiLimiter/);
    expect(route).toMatch(/eq\(mediaAssetsTable\.owner_user_id, req\.authenticatedUserId!\)/);
    expect(route).toMatch(/if \(!asset\) return res\.status\(404\)\.json\(\{ error: "Media asset not found\." \}\)/);
  });

  it("hides the asset before strict, retryable object cleanup", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const deletion = route.slice(route.indexOf('router.delete("/media-assets/:id"'));
    expect(deletion).toMatch(/status: "deleted"[\s\S]*storage_cleanup_pending/);
    expect(deletion).toMatch(/for\("update"\)/);
    expect(deletion).toMatch(/new Set\(\[asset\.original_key, asset\.variant_key, asset\.thumbnail_key\]/);
    expect(deletion).toMatch(/await deleteAssetStrict\(key\)/);
    expect(deletion).toMatch(/MEDIA_STORAGE_CLEANUP_INCOMPLETE/);
  });

  it("serializes raw uploads with deletion and prevents stale completion after tombstoning", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const upload = route.slice(route.indexOf('router.put("/media-assets/:id/upload"'), route.indexOf('router.post("/media-assets/:id/complete"'));
    expect(upload).toMatch(/\.for\("update"\)/);
    expect(upload.indexOf("await putAsset(")).toBeGreaterThan(upload.indexOf('.for("update")'));
    const complete = route.slice(route.indexOf('router.post("/media-assets/:id/complete"'), route.indexOf('router.delete("/media-assets/:id"'));
    expect(complete).toMatch(/inArray\(mediaAssetsTable\.status, \["pending", "failed"\]\)/);
    expect(complete).toMatch(/if \(!validatedAsset\)/);
  });

  it("retries failed object cleanup from durable tombstones", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const scheduler = await fs.readFile(schedulerPath, "utf8");
    expect(route).toMatch(/storage_cleanup_pending/);
    expect(scheduler).toMatch(/eq\(mediaAssetsTable\.status, "deleted"\)[\s\S]*storage_cleanup_pending/);
    expect(scheduler).toMatch(/await deleteAssetStrict\(key\)/);
    expect(scheduler).toMatch(/storage_cleanup_pending[\s\S]*'false'/);
  });

  it("rejects deleted linked media in Story APIs and preserves attachment order", async () => {
    const route = await fs.readFile(storyRoutePath, "utf8");
    expect(route).toMatch(/row\.media_asset_id !== null && row\.asset_status !== "ready"/);
    expect(route).toMatch(/item\.media\.media_asset_id === null \|\| item\.asset_status === "ready"/);
    expect(route).toMatch(/orderBy\(asc\(communityStoryMediaTable\.id\)\)/);
  });

  it("allows the staged Moment and Exchange Spark contexts in the database", async () => {
    const migration = await fs.readFile(migrationPath, "utf8");
    for (const context of ["exchange_spark", "community_moment", "hub_moment"]) {
      expect(migration).toContain(`'${context}'`);
    }
    expect(migration).toContain("'deletion_pending'");
  });

  it("serializes worker object creation with deletion and refuses deleted rows", async () => {
    const worker = await fs.readFile(workerPath, "utf8");
    const store = worker.slice(worker.indexOf("async function storeGeneratedAsset"), worker.indexOf("async function runFfmpeg"));
    expect(store).toMatch(/\.for\("update"\)/);
    expect(store.indexOf("await putAsset(key, bytes, mimeType)")).toBeGreaterThan(store.indexOf('.for("update")'));
    expect(store).toMatch(/if \(!asset \|\| asset\.status === "deleted"\) return false/);
    expect(worker).toMatch(/ne\(mediaAssetsTable\.status, "deleted"\)/);
    expect(worker).toMatch(/generatedCleanupSucceeded/);
  });
});