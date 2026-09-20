import { db, mediaAssetsTable, mediaProcessingJobsTable, type MediaJobType, type StoryCompositionManifest } from "@workspace/db";
import { and, eq, inArray, lt } from "drizzle-orm";
import { mediaProcessingQueue } from "./queue";
import { logger } from "./logger";
import { assertSupportedMediaJob, mediaJobsForType } from "./media-platform";

export interface MediaProcessingJobData {
  mediaAssetId: number;
  jobType: MediaJobType;
}

/**
 * Creates the durable database job records before publishing BullMQ jobs.
 * The unique database key and deterministic BullMQ job id make retries and
 * duplicate upload callbacks idempotent.
 */
export async function enqueueMediaAssetProcessing(
  mediaAssetId: number,
  mediaType: string,
  compositionManifest?: StoryCompositionManifest | null,
): Promise<boolean> {
  if (!mediaProcessingQueue) {
    logger.warn({ mediaAssetId }, "media-processing: Redis unavailable; asset remains pending");
    return false;
  }

  const jobTypes = mediaJobsForType(mediaType, compositionManifest);
  for (const jobType of jobTypes) {
    assertSupportedMediaJob(jobType);
    await db.insert(mediaProcessingJobsTable)
      .values({ media_asset_id: mediaAssetId, job_type: jobType })
      .onConflictDoNothing({
        target: [mediaProcessingJobsTable.media_asset_id, mediaProcessingJobsTable.job_type],
      });
    try {
      await mediaProcessingQueue.add(
        jobType,
        { mediaAssetId, jobType } satisfies MediaProcessingJobData,
        { jobId: `media-${mediaAssetId}-${jobType}` },
      );
    } catch (error) {
      logger.error({ err: error, mediaAssetId, jobType }, "media-processing: BullMQ publication failed");
      throw error;
    }
  }
  await db.update(mediaAssetsTable)
    .set({ status: "processing", updated_at: new Date() })
    .where(eq(mediaAssetsTable.id, mediaAssetId));
  return true;
}

/**
 * Republish durable DB jobs left behind by a transient Redis outage or a
 * process restart. BullMQ job IDs remain deterministic, so this is safe to
 * run on every worker boot without creating duplicate work.
 */
export async function requeueStaleMediaAssets(limit = 100): Promise<number> {
  if (!mediaProcessingQueue) return 0;
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const assets = await db.select({
    id: mediaAssetsTable.id,
    media_type: mediaAssetsTable.media_type,
    composition_manifest: mediaAssetsTable.composition_manifest,
  }).from(mediaAssetsTable).where(and(
    inArray(mediaAssetsTable.status, ["pending", "processing", "failed"]),
    lt(mediaAssetsTable.updated_at, staleBefore),
  )).limit(limit);

  let republished = 0;
  for (const asset of assets) {
    try {
      if (await enqueueMediaAssetProcessing(asset.id, asset.media_type, asset.composition_manifest)) {
        republished += 1;
      }
    } catch (error) {
      logger.warn({ err: error, mediaAssetId: asset.id }, "media-processing: stale asset republish failed");
    }
  }
  return republished;
}