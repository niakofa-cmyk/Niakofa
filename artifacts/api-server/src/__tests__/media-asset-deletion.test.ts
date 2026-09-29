import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/media-assets-v21.ts", import.meta.url);
const workerPath = new URL("../workers/media-process-worker.ts", import.meta.url);
const schedulerPath = new URL("../lib/scheduler.ts", import.meta.url);
const storyRoutePath = new URL("../routes/community-stories.ts", import.meta.url);
const usersRoutePath = new URL("../routes/users.ts", import.meta.url);
const workerToolchainPath = new URL("../lib/mediaCapabilities.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0178_media_asset_moment_contexts.sql", import.meta.url);
const cleanupMigrationPath = new URL("../../../../lib/db/migrations/0180_media_cleanup_ledger.sql", import.meta.url);
const storagePath = new URL("../lib/storage.ts", import.meta.url);

describe("V21 media asset deletion safety", () => {
  it("requires authentication and scopes deletion to the asset owner", async () => {
    const route = await fs.readFile(routePath, "utf8");
    expect(route).toMatch(/router\.delete\("\/media-assets\/:id", requireAuth, requireApproved, generalApiLimiter/);
    expect(route).toMatch(/eq\(mediaAssetsTable\.owner_user_id, req\.authenticatedUserId!\)/);
    expect(route).toMatch(/if \(!asset\) return res\.status\(404\)\.json\(\{ error: "Media asset not found\." \}\)/);
    expect(route).toMatch(/locked\.context_kind === "story" && isMomentMusicAsset\(locked\.metadata, req\.authenticatedUserId!\)/);
    expect(route).toContain("MOMENT_MUSIC_LINKED");
  });

  it("keeps every media read, write, and grant route behind authentication", async () => {
    const route = await fs.readFile(routePath, "utf8");
    for (const declaration of [
      'router.post("/media-assets/uploads"',
      'router.put("/media-assets/:id/upload"',
      'router.post("/media-assets/:id/complete"',
      'router.delete("/media-assets/:id"',
      'router.post("/media-assets/:id/playback-grant"',
      'router.get("/media-assets/shared"',
      'router.get("/media-assets/:id/thumbnail"',
      'router.get("/media-assets/:id"',
    ]) {
      const start = route.indexOf(declaration);
      expect(start).toBeGreaterThanOrEqual(0);
      const line = route.slice(start, route.indexOf("\n", start));
      expect(line).toMatch(/requireAuth, requireApproved, generalApiLimiter/);
    }
    const playback = route.slice(route.indexOf('router.get("/media-assets/:id/play"'));
    expect(playback).toMatch(/verifyExchangeSparkPlaybackGrant/);
    expect(playback).toMatch(/if \(!assetId \|\| !claims\) return res\.status\(404\)/);
    const direct = route.slice(route.indexOf("async function streamMediaAsset"));
    expect(direct).toMatch(/asset\.context_kind === "exchange_spark" && asset\.media_type === "video"/);
    expect(direct).toMatch(/verifyExchangeSparkPlaybackGrant/);
  });

  it("hides the asset before strict, retryable object cleanup", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const deletion = route.slice(route.indexOf('router.delete("/media-assets/:id"'));
    expect(deletion).toMatch(/status: "deleted"[\s\S]*storage_cleanup_pending/);
    expect(deletion).toMatch(/for\("update"\)/);
    expect(deletion).toMatch(/mediaStorageKeys\(asset\)/);
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

  it("expires abandoned pending uploads under a row lock and leaves retryable tombstones", async () => {
    const scheduler = await fs.readFile(schedulerPath, "utf8");
    expect(scheduler).toMatch(/MEDIA_UPLOAD_SESSION_RETENTION_MS = 24 \* 60 \* 60 \* 1000/);
    expect(scheduler).toMatch(/eq\(mediaAssetsTable\.status, "pending"\)[\s\S]*lte\(mediaAssetsTable\.updated_at, staleUploadCutoff\)/);
    expect(scheduler).toMatch(/\.for\("update", \{ skipLocked: true \}\)[\s\S]*status: "deleted"[\s\S]*storage_cleanup_pending/);
    expect(scheduler).toMatch(/stale pending upload sessions expired/);
    expect(scheduler).toMatch(/stale_upload_cleanup_pending/);
  });

  it("preserves every account-owned media key until strict cleanup succeeds", async () => {
    const users = await fs.readFile(usersRoutePath, "utf8");
    const deletion = users.slice(users.indexOf("async function anonymizeAccount"), users.indexOf("function sendDeletionAccepted"));
    expect(deletion).toMatch(/status: "deleted"[\s\S]*storage_cleanup_pending/);
    expect(deletion).toMatch(/eq\(mediaAssetsTable\.owner_user_id, userId\)/);
    expect(deletion).not.toMatch(/tx\.delete\(mediaAssetsTable\)/);
    expect(deletion).not.toMatch(/deleteAsset\(/);
    const scheduler = await fs.readFile(schedulerPath, "utf8");
    expect(scheduler).toMatch(/account_cleanup_pending[\s\S]*await db\.delete\(mediaAssetsTable\)/);
  });

  it("rotates failed tombstones behind unattempted rows so bounded batches progress", async () => {
    const scheduler = await fs.readFile(schedulerPath, "utf8");
    const cleanup = scheduler.slice(
      scheduler.indexOf("const tombstoneCleanup = await db.transaction"),
      scheduler.indexOf("for (const id of ids)"),
    );
    expect(cleanup).toMatch(/orderBy\(mediaAssetsTable\.updated_at, mediaAssetsTable\.id\)[\s\S]*limit\(MEDIA_CLEANUP_BATCH_SIZE\)[\s\S]*for\("update", \{ skipLocked: true \}\)/);
    expect(cleanup).toMatch(/catch \(err\)[\s\S]*set\(\{ updated_at: new Date\(\) \}\)[\s\S]*storage_cleanup_pending/);
    expect(cleanup).toMatch(/Oldest retry timestamp first[\s\S]*behind unattempted tombstones next run/);
  });

  it("does not mark an account purged while any owned media cleanup marker remains", async () => {
    const scheduler = await fs.readFile(schedulerPath, "utf8");
    const purge = scheduler.slice(
      scheduler.indexOf("export async function processScheduledAccountPurges"),
      scheduler.indexOf("export function startScheduledAccountPurgeWorker"),
    );
    expect(purge).toMatch(/NOT EXISTS[\s\S]*FROM media_assets[\s\S]*media_assets\.owner_user_id = \$\{usersTable\.id\}/);
    expect(purge).toMatch(/storage_cleanup_pending[\s\S]*account_cleanup_pending/);
  });

  it("uses the same configured FFmpeg and FFprobe paths for startup and jobs", async () => {
    const capabilities = await fs.readFile(workerToolchainPath, "utf8");
    const worker = await fs.readFile(workerPath, "utf8");
    const index = await fs.readFile(new URL("../index.ts", import.meta.url), "utf8");
    expect(capabilities).toMatch(/export const getMediaToolPaths/);
    expect(index).toMatch(/if \(isMediaPlatformV21Enabled\(\)\)[\s\S]*await verifyMediaToolchain\(\)/);
    expect(worker).toMatch(/const mediaToolPaths = getMediaToolPaths\(\)/);
    expect(worker).toMatch(/execFileAsync\(mediaToolPaths\.ffmpeg/);
    expect(worker).toMatch(/execFileAsync\(mediaToolPaths\.ffprobe/);
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
    expect(store).toMatch(/if \(!asset \|\| asset\.status === "deleted"\) return "deleted"/);
    expect(store).toMatch(/Promise<"stored" \| "deleted" \| "superseded">/);
    expect(worker).toMatch(/ne\(mediaAssetsTable\.status, "deleted"\)/);
    expect(worker).toMatch(/generatedCleanupSucceeded/);
  });

  it("cancels a claimed job when its asset is tombstoned", async () => {
    const worker = await fs.readFile(workerPath, "utf8");
    expect(worker).toMatch(/async function cancelClaimedJob\(jobId: number\)/);
    expect(worker).toMatch(/status: "cancelled"[\s\S]*error: "MEDIA_ASSET_DELETED"[\s\S]*completed_at: new Date\(\)/);
    expect(worker).toMatch(/if \(!asset \|\| asset\.status === "deleted"\) \{\s*await cancelClaimedJob\(claimed\.id\)/);
    expect(worker).toMatch(/if \(!currentAsset \|\| currentAsset\.status === "deleted"\) \{\s*await cancelClaimedJob\(claimed\.id\)/);
  });

  it("verifies provider absence and durably retains generated and temp cleanup keys", async () => {
    const storage = await fs.readFile(storagePath, "utf8");
    const worker = await fs.readFile(workerPath, "utf8");
    const route = await fs.readFile(routePath, "utf8");
    const scheduler = await fs.readFile(schedulerPath, "utf8");
    const migration = await fs.readFile(cleanupMigrationPath, "utf8");
    expect(storage).toMatch(/async function verifyAssetAbsent[\s\S]*STORAGE_OBJECT_DELETE_UNCONFIRMED/);
    expect(storage).toMatch(/export async function deleteAssetStrict[\s\S]*await verifyAssetAbsent/);
    expect(worker).toMatch(/cleanup_keys/);
    expect(route).toMatch(/mediaStorageKeys\(asset\)/);
    expect(scheduler).toMatch(/mediaStorageKeys\(asset\)/);
    expect(migration).toMatch(/cleanup_keys jsonb NOT NULL DEFAULT '\[\]'/);
  });

  it("finalizes a claimed worker job and ready state under the asset row lock", async () => {
    const worker = await fs.readFile(workerPath, "utf8");
    expect(worker).toMatch(/async function completeClaimedJob/);
    expect(worker).toMatch(/\.for\("update"\)/);
    expect(worker).toMatch(/status: "cancelled"[\s\S]*MEDIA_ASSET_DELETED/);
    expect(worker).toMatch(/status: "completed"[\s\S]*status: "ready"/);
  });
});
