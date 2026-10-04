import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import {
  familyMemoryStorageKeyFor,
  familyMemoryVisibilityAllows,
} from "../routes/family";

const routePath = new URL("../routes/family.ts", import.meta.url);

describe("Family Vault privacy and storage policy", () => {
  it("allows family memories, private authors/managers, and fails closed for branch", () => {
    expect(familyMemoryVisibilityAllows("family", 22, 7, "viewer")).toBe(true);
    expect(familyMemoryVisibilityAllows("private", 7, 7, "viewer")).toBe(true);
    expect(familyMemoryVisibilityAllows("private", 22, 7, "viewer")).toBe(false);
    expect(familyMemoryVisibilityAllows("private", 22, 7, "curator")).toBe(true);
    expect(familyMemoryVisibilityAllows("branch", 7, 7, "owner")).toBe(false);
  });

  it("accepts only a single safe object name under the exact family/memory prefix", () => {
    expect(familyMemoryStorageKeyFor(4, 9, "families/4/memories/9/uuid_photo.jpg")).toBe(true);
    expect(familyMemoryStorageKeyFor(4, 9, "families/5/memories/9/uuid_photo.jpg")).toBe(false);
    expect(familyMemoryStorageKeyFor(4, 9, "families/4/memories/8/uuid_photo.jpg")).toBe(false);
    expect(familyMemoryStorageKeyFor(4, 9, "families/4/memories/9/../9/secret")).toBe(false);
    expect(familyMemoryStorageKeyFor(4, 9, "/families/4/memories/9/secret")).toBe(false);
    expect(familyMemoryStorageKeyFor(4, 9, "families/4/memories/9/subdir/file")).toBe(false);
  });

  it("wires every memory-sensitive route through the shared access guard", async () => {
    const source = await fs.readFile(routePath, "utf8");
    for (const declaration of [
      'router.use("/family/assets"',
      'router.get("/family/:id/memories/:memoryId"',
      'router.post(\n  "/family/:id/memories/:memoryId/assets/upload-url"',
      'router.post(\n  "/family/:id/memories/:memoryId/assets"',
      'router.post(\n  "/family/:id/memories/:memoryId/assets/upload-direct"',
      'router.delete(\n  "/family/:id/memories/:memoryId/assets/:assetId"',
      'router.get(\n  "/family/:id/memories/:memoryId/comments"',
      'router.post(\n  "/family/:id/memories/:memoryId/comments"',
      'router.post(\n  "/family/:id/memories/:memoryId/translate"',
    ]) {
      const start = source.indexOf(declaration);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = source.indexOf("\n// ", start + declaration.length);
      expect(source.slice(start, end < 0 ? undefined : end)).toContain("getAccessibleMemory");
    }
  });

  it("streams authorized Family assets through the same origin without storage redirects", async () => {
    const source = await fs.readFile(routePath, "utf8");
    const start = source.indexOf('router.use("/family/assets"');
    const end = source.indexOf("\n// ─── Validation schemas", start);
    const assetRoute = source.slice(start, end);

    expect(assetRoute).toContain("getAccessibleMemory(familyId, memoryId");
    expect(assetRoute).toContain("if (!access.memory || access.forbidden)");
    expect(assetRoute).toContain("await streamAssetSameOrigin(rel, res)");
    expect(assetRoute).not.toContain("streamOrRedirectAsset");
  });

  it("strictly removes objects before deleting memory or asset rows", async () => {
    const source = await fs.readFile(routePath, "utf8");
    const memoryDelete = source.slice(
      source.indexOf('router.delete("/family/:id/memories/:memoryId"'),
      source.indexOf("// ─── Memory Assets", source.indexOf('router.delete("/family/:id/memories/:memoryId"')),
    );
    expect(memoryDelete).toContain("deleteAssetStrict");
    expect(memoryDelete.indexOf("deleteAssetStrict")).toBeLessThan(memoryDelete.indexOf("db.delete(familyMemoriesTable)"));
    expect(memoryDelete).toContain("cleanup incomplete");
    expect(memoryDelete).toContain("rows remain for retry");
    expect(memoryDelete).toContain("Some objects may already have been removed");

    const assetDelete = source.slice(source.indexOf('"/family/:id/memories/:memoryId/assets/:assetId"'));
    expect(assetDelete).toContain("deleteAssetStrict");
    expect(assetDelete.indexOf("deleteAssetStrict")).toBeLessThan(assetDelete.indexOf("db.delete(familyMemoryAssetsTable)"));
    expect(source).toContain("randomUUID()");
    const directUpload = source.slice(source.indexOf('"/family/:id/memories/:memoryId/assets/upload-direct"'));
    expect(directUpload).toContain("family_direct_upload_orphan_cleanup_failed");
    expect(directUpload).toContain("await deleteAssetStrict(storageKey)");
    expect(directUpload.indexOf("await deleteAssetStrict(storageKey)")).toBeLessThan(
      directUpload.indexOf("return res.status(502)"),
    );
  });

  it("cleans every family asset before owner family deletion and preserves retryability", async () => {
    const source = await fs.readFile(routePath, "utf8");
    const deletion = source.slice(
      source.indexOf('router.delete("/family/:id"'),
      source.indexOf("// ─── Family Members", source.indexOf('router.delete("/family/:id"')),
    );
    expect(deletion).toContain("familyMemoryAssetsTable");
    expect(deletion).toContain("innerJoin");
    expect(deletion).toContain("familyMemoriesTable.family_id");
    expect(deletion).toContain("deleteAssetStrict(asset.storage_key)");
    expect(deletion).toContain("deleteAssetStrict(asset.thumbnail_key)");
    expect(deletion.indexOf("deleteAssetStrict")).toBeLessThan(deletion.indexOf("db.delete(familiesTable)"));
    expect(deletion).toContain("database rows remain for retry");
  });

  it("checks ambiguous asset confirmation writes before deleting the uploaded object", async () => {
    const source = await fs.readFile(routePath, "utf8");
    const confirmation = source.slice(
      source.indexOf('"/family/:id/memories/:memoryId/assets"'),
      source.indexOf("// POST /family/:id/memories/:memoryId/assets/upload-direct"),
    );
    expect(confirmation).toContain("committedAsset");
    expect(confirmation).toContain("familyMemoryAssetsTable.storage_key");
    expect(confirmation).toContain("deleteAssetStrict(parsed.data.storage_key)");
    expect(confirmation).toContain("family_asset_orphan_cleanup_failed");
    expect(confirmation.indexOf("committedAsset")).toBeLessThan(confirmation.indexOf("deleteAssetStrict(parsed.data.storage_key)"));
    expect(confirmation).toContain("return res.status(201).json({ asset: committedAsset })");
    expect(confirmation).toContain("outcome uncertain; object retained");
    expect(confirmation).toContain("family_asset_empty_row_cleanup_failed");
  });
});