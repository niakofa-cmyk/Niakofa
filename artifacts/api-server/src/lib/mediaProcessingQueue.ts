import {
  communityStoriesTable,
  db,
  exchangeSparksTable,
  mediaAssetsTable,
  mediaProcessingJobsTable,
  type MediaJobType,
  type StoryCompositionManifest,
} from "@workspace/db";
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
  publisher: Pick<NonNullable<typeof mediaProcessingQueue>, "add"> | null = mediaProcessingQueue,
  database: typeof db = db,
): Promise<boolean> {
  if (!publisher) {
    logger.warn({ mediaAssetId }, "media-processing: Redis unavailable; asset remains pending");
    return false;
  }

  const jobTypes = mediaJobsForType(mediaType, compositionManifest);
  const [assetContext] = await database.select({
    context_kind: mediaAssetsTable.context_kind,
    context_id: mediaAssetsTable.context_id,
  }).from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.id, mediaAssetId))
    .limit(1);
  if (!assetContext) return false;

  const transitionAsset = async (executor: Pick<typeof database, "update" | "select">): Promise<boolean> => {
    const conditions = [
      eq(mediaAssetsTable.id, mediaAssetId),
      eq(mediaAssetsTable.context_kind, assetContext.context_kind),
      eq(mediaAssetsTable.context_id, assetContext.context_id),
      inArray(mediaAssetsTable.status, ["pending", "failed", "processing"]),
    ];
    const [transitioned] = await executor.update(mediaAssetsTable)
      .set({ status: "processing", failure_reason: null, updated_at: new Date() })
      .where(and(...conditions))
      .returning({ id: mediaAssetsTable.id });
    if (transitioned) return true;

    const [asset] = await executor.select({ status: mediaAssetsTable.status })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1);
    return asset?.status === "ready";
  };

  if (assetContext.context_kind === "story") {
    const canTransition = await database.transaction(async (tx) => {
      // Match Story deletion's lock order: Story first, then media asset.
      // The context lookup above intentionally takes no asset row lock.
      const [story] = await tx.select({ status: communityStoriesTable.status })
        .from(communityStoriesTable)
        .where(eq(communityStoriesTable.id, assetContext.context_id))
        .limit(1)
        .for("share");
      if (!story || story.status === "deletion_pending") return false;
      return transitionAsset(tx);
    });
    if (!canTransition) return false;
  } else if (assetContext.context_kind === "exchange_spark") {
    const canTransition = await database.transaction(async (tx) => {
      const [spark] = await tx.select({ status: exchangeSparksTable.status })
        .from(exchangeSparksTable)
        .where(eq(exchangeSparksTable.id, assetContext.context_id))
        .limit(1)
        .for("share");
      if (!spark || spark.status === "deletion_pending") return false;
      return transitionAsset(tx);
    });
    if (!canTransition) return false;
  } else if (!(await transitionAsset(database))) {
    return false;
  }

  for (const jobType of jobTypes) {
    assertSupportedMediaJob(jobType);
    await database.insert(mediaProcessingJobsTable)
      .values({ media_asset_id: mediaAssetId, job_type: jobType })
      .onConflictDoNothing({
        target: [mediaProcessingJobsTable.media_asset_id, mediaProcessingJobsTable.job_type],
      });
    try {
      await publisher.add(
        jobType,
        { mediaAssetId, jobType } satisfies MediaProcessingJobData,
        { jobId: `media-${mediaAssetId}-${jobType}` },
      );
    } catch (error) {
      logger.error({ err: error, mediaAssetId, jobType }, "media-processing: BullMQ publication failed");
      throw error;
    }
  }
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