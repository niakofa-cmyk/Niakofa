import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/media-assets-v21.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0189_resumable_media_uploads.sql", import.meta.url);

describe("V21 resumable media upload wiring", () => {
  it("keeps session creation, status, and chunk writes behind V21 and authenticated ownership", async () => {
    const route = await fs.readFile(routePath, "utf8");
    expect(route).toMatch(/router\.get\("\/media-assets\/:id\/upload-session", requireAuth, requireApproved, generalApiLimiter/);
    expect(route).toMatch(/router\.put\([\s\S]*?"\/media-assets\/:id\/upload\/chunks"[\s\S]*?requireAuth,[\s\S]*?requireApproved,[\s\S]*?express\.raw/);
    const chunkRoute = route.slice(route.indexOf('"/media-assets/:id/upload/chunks"'), route.indexOf('router.put("/media-assets/:id/upload"'));
    expect(chunkRoute).toMatch(/if \(!isMediaPlatformV21Enabled\(\)\) return disabled\(res\)/);
    expect(chunkRoute).toMatch(/eq\(mediaAssetsTable\.owner_user_id, req\.authenticatedUserId!\)/);
    expect(chunkRoute).toMatch(/\.for\("update"\)/);
    expect(chunkRoute).toMatch(/createHash\("sha256"\)/);
    expect(chunkRoute).toMatch(/decideMediaChunk/);
    expect(chunkRoute).toMatch(/cleanup_keys:/);
    expect(chunkRoute.match(/jsonb_build_array\(\$\{objectKey\}::text\)/g)).toHaveLength(2);
    expect(chunkRoute).toMatch(/mediaUploadSessionsTable/);
    expect(chunkRoute.indexOf("cleanup_keys:")).toBeLessThan(chunkRoute.lastIndexOf("await putAsset"));
  });

  it("does not complete until durable offsets equal the declared byte size and reuses media validation", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const complete = route.slice(route.indexOf("async function assembleResumableMedia"), route.indexOf('router.delete("/media-assets/:id"'));
    expect(complete).toMatch(/session\.next_offset !== asset\.byte_size/);
    expect(complete).toMatch(/getAssetBuffer\(chunk\.object_key, session\.chunk_size\)/);
    expect(complete).toMatch(/await putAsset\(asset\.original_key, fullMedia, asset\.mime_type\)/);
    expect(complete).toMatch(/validateMediaBuffer\(bytes, asset\.media_type, asset\.mime_type\)/);
    expect(complete).toMatch(/MEDIA_UPLOAD_INCOMPLETE/);
    const assembly = complete.slice(0, complete.indexOf("async function cleanupFinalizedMediaChunks"));
    expect(assembly).not.toContain("deleteAssetStrict");
    expect(complete).toMatch(/cleanupFinalizedChunkObjects\([\s\S]*deleteAssetStrict[\s\S]*db\.transaction/);
  });

  it("persists session offsets and unique per-offset checksum records without storing bytes in PostgreSQL", async () => {
    const migration = await fs.readFile(migrationPath, "utf8");
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS media_upload_sessions/);
    expect(migration).toMatch(/next_offset integer NOT NULL DEFAULT 0/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS media_upload_chunks/);
    expect(migration).toMatch(/UNIQUE \(media_asset_id, byte_offset\)/);
    expect(migration).toMatch(/object_key text NOT NULL UNIQUE/);
    expect(migration).not.toMatch(/bytea|bytea\(/i);
  });
});