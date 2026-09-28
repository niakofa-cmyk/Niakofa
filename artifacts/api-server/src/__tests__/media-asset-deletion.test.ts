import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/media-assets-v21.ts", import.meta.url);
const workerPath = new URL("../workers/media-process-worker.ts", import.meta.url);

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
    expect(deletion).toMatch(/\.set\(\{ status: "deleted", updated_at: new Date\(\) \}\)/);
    expect(deletion).toMatch(/for\("update"\)/);
    expect(deletion).toMatch(/new Set\(\[asset\.original_key, asset\.variant_key, asset\.thumbnail_key\]/);
    expect(deletion).toMatch(/await deleteAssetStrict\(key\)/);
    expect(deletion).toMatch(/MEDIA_STORAGE_CLEANUP_INCOMPLETE/);
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