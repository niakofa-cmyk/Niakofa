import { readFile } from "node:fs/promises";
import { describe, expect, it } from "@jest/globals";
import {
  isMomentCompositionStatusVisibleToViewer,
  isMomentCompositionStoryStatus,
  validMomentComposeIds,
} from "../lib/moment-video-compose";

const routeFile = new URL("../routes/community-stories.ts", import.meta.url);
const workerFile = new URL("../workers/media-process-worker.ts", import.meta.url);
const queueFile = new URL("../lib/mediaProcessingQueue.ts", import.meta.url);
const migrationFile = new URL("../../../../lib/db/migrations/0190_moment_video_compositions.sql", import.meta.url);
const singleClipMigrationFile = new URL("../../../../lib/db/migrations/0196_moment_video_single_clip.sql", import.meta.url);

describe("Moment camera-reel server contract", () => {
  it("requires explicit intent and strictly ordered source asset IDs on a dedicated endpoint", async () => {
    const route = await readFile(routeFile, "utf8");
    expect(route).toMatch(/momentCompositionRequestSchema = z\.object\(\{\s*intent: z\.literal\(MOMENT_COMPOSE_INTENT\)/);
    expect(route).toMatch(/router\.post\("\/community\/stories\/:id\/moment-composition"/);
    expect(route).toMatch(/if \(!isMediaPlatformV21Enabled\(\)\)/);
    expect(route).toMatch(/momentCompositionFingerprint\(sourceIds\)/);
    expect(route).toMatch(/source_fingerprint !== fingerprint/);
  });

  it("accepts one source video and updates the database constraint for existing installs", async () => {
    const [route, worker, baselineMigration, forwardMigration] = await Promise.all([
      readFile(routeFile, "utf8"),
      readFile(workerFile, "utf8"),
      readFile(migrationFile, "utf8"),
      readFile(singleClipMigrationFile, "utf8"),
    ]);
    expect(validMomentComposeIds([71])).toBe(true);
    expect(validMomentComposeIds([])).toBe(false);
    expect(validMomentComposeIds([71, 71])).toBe(false);
    expect(route).toMatch(/media_asset_ids: z\.array\(z\.number\(\)\.int\(\)\.positive\(\)\)\.min\(1\)\.max\(6\)/);
    expect(worker).toMatch(/composition\.source_ids\.length < 1/);
    expect(baselineMigration).toMatch(/jsonb_array_length\(source_media_asset_ids\) BETWEEN 1 AND 6/);
    expect(forwardMigration).toMatch(/DROP CONSTRAINT IF EXISTS community_story_moment_compositions_sources_check/);
    expect(forwardMigration).toMatch(/jsonb_array_length\(source_media_asset_ids\) BETWEEN 1 AND 6/);
  });

  it("keeps original Story attachment rows and rejects Exchange-linked Stories", async () => {
    const route = await readFile(routeFile, "utf8");
    expect(route).toMatch(/if \(story\.exchange_listing_id !== null\) return \{ error: "invalid" \}/);
    expect(route).toMatch(/eq\(communityStoryMediaTable\.story_id, storyId\)[\s\S]*inArray\(communityStoryMediaTable\.media_asset_id, sourceIds\)/);
    expect(route).toMatch(/media: media\.filter\([\s\S]*media_url: `\/api\/community\/stories\/media\/\$\{item\.id\}`/);
    expect(route).toMatch(/moment_video: momentVideo \?\? null/);
  });

  it("limits composition to attached owned Moment videos and applies private playback authorization", async () => {
    const route = await readFile(routeFile, "utf8");
    expect(route).toMatch(/asset\.owner_user_id !== req\.authenticatedUserId/);
    expect(route).toMatch(/isPublishedStoryMediaContext\(asset\.context_kind, asset\.context_id, story\.id\)/);
    expect(route).toMatch(/withinMomentDurationLimit\(/);
    expect(route).toMatch(/viewerCanReadStory\(req\.authenticatedUserId!, composition\)/);
    expect(route).toMatch(/verifyStoryPlaybackGrant\(cookieValue, tokenMediaId, secret\)/);
    expect(route).toMatch(/streamAssetRange\(\s*composition\.variant_key/);
  });

  it("shows review-pending Moments only to their author and returns stitch order only to the author", async () => {
    const route = await readFile(routeFile, "utf8");
    expect(route).toMatch(/eq\(communityStoriesTable\.status, "published"\)[\s\S]*eq\(communityStoriesTable\.status, "pending"\)[\s\S]*eq\(communityStoriesTable\.author_user_id, userId\)/);
    expect(route).toMatch(/viewerUserId === row\.author_user_id && row\.status/);
    expect(route).toMatch(/composition\.author_user_id === req\.authenticatedUserId[\s\S]*source_media_asset_ids: composition\.source_media_asset_ids/);
  });

  it("processes pending camera compositions privately for their author", async () => {
    expect(isMomentCompositionStoryStatus("pending")).toBe(true);
    expect(isMomentCompositionStoryStatus("published")).toBe(true);
    expect(isMomentCompositionStoryStatus("rejected")).toBe(false);
    expect(isMomentCompositionStatusVisibleToViewer("pending", 7, 7)).toBe(true);
    expect(isMomentCompositionStatusVisibleToViewer("pending", 7, 8)).toBe(false);
    expect(isMomentCompositionStatusVisibleToViewer("published", 7, 8)).toBe(true);
    expect(isMomentCompositionStatusVisibleToViewer("rejected", 7, 7)).toBe(false);

    const [route, worker, queue] = await Promise.all([
      readFile(routeFile, "utf8"),
      readFile(workerFile, "utf8"),
      readFile(queueFile, "utf8"),
    ]);
    expect(route).toMatch(/!isMomentCompositionStoryStatus\(story\.status\)/);
    expect(route.match(/isMomentCompositionStatusVisibleToViewer\(/g)).toHaveLength(3);
    expect(worker).toMatch(/isMomentCompositionStoryStatus\(story\.status\)/);
    expect(worker).toMatch(/isMomentCompositionStoryStatus\(composition\.story_status\)/);
    expect(queue).toMatch(/!isMomentCompositionStoryStatus\(story\.status\)/);
  });

it("prevents derived compositions from generic media, thumbnail, HEAD, or range playback", async () => {
  const mediaRoute = await readFile(new URL("../routes/media-assets-v21.ts", import.meta.url), "utf8");
  const storyRoute = await readFile(routeFile, "utf8");
  const genericStream = mediaRoute.slice(
    mediaRoute.indexOf("async function streamMediaAsset"),
    mediaRoute.indexOf('router.get("/media-assets/:id/thumbnail"'),
  );

  expect(genericStream).toMatch(/from\(communityStoryMomentCompositionsTable\)[\s\S]*where\(eq\(communityStoryMomentCompositionsTable\.derived_media_asset_id, assetId\)\)/);
  expect(genericStream).toMatch(/composition \|\| asset\.metadata\?\.derived_kind === "moment_camera_clip_reel"[\s\S]*status\(404\)/);
  expect(genericStream.indexOf("if (composition || asset.metadata")).toBeLessThan(genericStream.indexOf("streamAssetRange("));
  // Express routes HEAD through GET by default, so the same guard protects
  // HEAD and range requests, including the separate generic thumbnail path.
  expect(mediaRoute).not.toMatch(/router\.head\(["']\/media-assets\/:id/);
  expect(mediaRoute).toMatch(/router\.get\("\/media-assets\/:id\/thumbnail"[\s\S]*streamMediaAsset\(req, res, true\)/);
  expect(mediaRoute).toMatch(/router\.get\("\/media-assets\/:id"[\s\S]*streamMediaAsset\(req, res, false\)/);

  // The original Story attachment endpoint is unchanged; only derived reel
  // assets are withheld from generic media streaming.
  expect(storyRoute).toMatch(/media_url: `\/api\/community\/stories\/media\/\$\{item\.id\}`/);
  expect(storyRoute).toMatch(/verifyStoryPlaybackGrant/);
  expect(storyRoute).toMatch(/viewerCanReadStory\(req\.authenticatedUserId!, composition\)/);
});

  it("uses the existing durable media worker with bounded output and ffprobe checks", async () => {
    const worker = await readFile(workerFile, "utf8");
    const migration = await readFile(migrationFile, "utf8");
    expect(worker).toMatch(/jobType === "moment_compose"/);
    expect(worker).toMatch(/readBoundedOutput\(outputPath\)/);
    expect(worker).toMatch(/probeCompositionFile\(outputPath\)/);
    expect(migration).toMatch(/job_type IN \('probe', 'thumbnail', 'transcode', 'audio_mix', 'moment_compose'\)/);
    expect(migration).toMatch(/UNIQUE INDEX IF NOT EXISTS community_story_moment_compositions_story_uidx/);
  });

  it("keeps Story deletion from racing past a processing composition's storage write", async () => {
    const route = await readFile(routeFile, "utf8");
    const worker = await readFile(workerFile, "utf8");
    const deletion = route.slice(route.indexOf('router.delete("/community/stories/:id"'));
    expect(deletion).toMatch(/eq\(mediaProcessingJobsTable\.status, "processing"\)/);
    expect(deletion.indexOf("if (processingJob)")).toBeLessThan(deletion.indexOf("deleteAssetStrict(key)"));
    expect(worker).toMatch(/cleanup_keys:[\s\S]*await putAsset\(key, bytes, mimeType\)/);
    expect(worker).toMatch(/from\(communityStoriesTable\)[\s\S]*\.for\("share"\)/);
    expect(worker).toMatch(/from\(mediaAssetsTable\)[\s\S]*\.for\("update"\)/);
  });

  it("fences stale composition attempts and publishes attempt-specific output only after claim CAS", async () => {
    const worker = await readFile(workerFile, "utf8");
    expect(worker).toMatch(/attempts: sql`\$\{mediaProcessingJobsTable\.attempts\} \+ 1`/);
    expect(worker).toMatch(/eq\(mediaProcessingJobsTable\.attempts, attempt\)/);
    expect(worker).toMatch(/momentComposeAttemptOutputKey\(mediaAssetId, attempt\)/);
    expect(worker).toMatch(/stageMomentCompositionOutput\([\s\S]*jobId,[\s\S]*attempt,[\s\S]*generatedKey/);
    expect(worker).toMatch(/function stageMomentCompositionOutput[\s\S]*\.for\("share"\)[\s\S]*\.for\("update"\)[\s\S]*momentCompositionAttemptOwnsJob/);
    expect(worker).toMatch(/variant_key: outputKey/);
    expect(worker).toMatch(/const \[completedJob\] = await tx\.update\(mediaProcessingJobsTable\)/);
  });

  it("commits each attempt key to the cleanup ledger before the provider PUT transaction", async () => {
    const worker = await readFile(workerFile, "utf8");
    const stage = worker.slice(
      worker.indexOf("async function stageMomentCompositionOutput"),
      worker.indexOf("async function beginMomentCompositionAttempt"),
    );
    expect(stage).toMatch(/return withDurableCleanupLedger\(/);
    expect(stage.indexOf("async (ledgerKey) => db.transaction")).toBeLessThan(
      stage.indexOf("async () => db.transaction"),
    );
    const ledgerCommitBoundary = stage.indexOf("return true;\n    }),\n    async () => db.transaction");
    expect(ledgerCommitBoundary).toBeGreaterThan(-1);
    expect(stage.indexOf("await putAsset(key, bytes, \"video/mp4\")")).toBeGreaterThan(
      stage.indexOf("async () => db.transaction"),
    );
  });

  it("reconciles an ambiguous promotion commit before deleting the attempt object", async () => {
    const worker = await readFile(workerFile, "utf8");
    expect(worker).toMatch(/reconcileMomentCompositionPromotion\([\s\S]*readMomentCompositionPromotionState/);
    expect(worker).toMatch(/async function readMomentCompositionPromotionState[\s\S]*\.for\("share"\)[\s\S]*\.for\("update"\)[\s\S]*variant_key: asset\.variant_key/);
    expect(worker).toMatch(/if \(reconciliation === "promoted"\)[\s\S]*generatedKey = undefined[\s\S]*return/);
    expect(worker).toMatch(/if \(reconciliation === "unknown"\)[\s\S]*retaining attempt output/);
  });

  it("does not requeue an unfinished resumable upload, including an empty legacy session", async () => {
    const queue = await readFile(queueFile, "utf8");
    expect(queue).toMatch(/mediaUploadSessionsTable\.finalized, false/);
    expect(queue).toMatch(/isUnfinishedResumableUpload\(session\.finalized, session\.next_offset\)/);
    expect(queue).toMatch(/notInArray\(mediaAssetsTable\.id, unfinishedUploadIds\)/);
  });

  it("CAS-requeues stale work under Story and asset locks so deletion wins safely", async () => {
    const queue = await readFile(queueFile, "utf8");
    expect(queue).toMatch(/eq\(mediaProcessingJobsTable\.status, pending\.status\)/);
    expect(queue).toMatch(/eq\(mediaProcessingJobsTable\.updated_at, pending\.updatedAt\)/);
    expect(queue).toMatch(/\.for\("share"\)[\s\S]*\.for\("update"\)/);
    expect(queue).toMatch(/if \(!story \|\| !isMomentCompositionStoryStatus\(story\.status\) \|\| story\.expires_at <= new Date\(\)\) return false/);
  });

  it("validates published source Story context in both API and worker", async () => {
    const route = await readFile(routeFile, "utf8");
    const worker = await readFile(workerFile, "utf8");
    expect(route).toMatch(/isPublishedStoryMediaContext\(asset\.context_kind, asset\.context_id, story\.id\)/);
    expect(worker).toMatch(/isPublishedStoryMediaContext\(source\.context_kind, source\.context_id, composition\.story_id\)/);
  });
});