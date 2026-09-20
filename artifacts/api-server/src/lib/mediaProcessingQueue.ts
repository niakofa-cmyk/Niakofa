import { db, mediaAssetsTable, mediaProcessingJobsTable, type MediaJobType } from "@workspace/db";
import { eq } from "drizzle-orm";
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
export async function enqueueMediaAssetProcessing(mediaAssetId: number, mediaType: string): Promise<boolean> {
  if (!mediaProcessingQueue) {
    logger.warn({ mediaAssetId }, "media-processing: Redis unavailable; asset remains pending");
    return false;
  }

  const jobTypes = mediaJobsForType(mediaType);
  for (const jobType of jobTypes) {
    assertSupportedMediaJob(jobType);
    await db.insert(mediaProcessingJobsTable)
      .values({ media_asset_id: mediaAssetId, job_type: jobType })
      .onConflictDoNothing({
        target: [mediaProcessingJobsTable.media_asset_id, mediaProcessingJobsTable.job_type],
      });
    await mediaProcessingQueue.add(
      jobType,
      { mediaAssetId, jobType } satisfies MediaProcessingJobData,
      { jobId: `media-${mediaAssetId}-${jobType}` },
    );
  }
  await db.update(mediaAssetsTable)
    .set({ status: "processing", updated_at: new Date() })
    .where(eq(mediaAssetsTable.id, mediaAssetId));
  return true;
}