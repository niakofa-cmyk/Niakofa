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
 * Publishes the stable BullMQ job represented by a ready asset's queued or
 * failed thumbnail row. Safe to call after a Story retry or worker restart.
 */
export async function enqueuePendingMediaAssetThumbnail(
  mediaAssetId: number,
  publisher: Pick<NonNullable<typeof mediaProcessingQueue>, "add"> | null = mediaProcessingQueue,
  database: typeof db = db,
): Promise<boolean> {
  const [pending] = await database.select({
    id: mediaProcessingJobsTable.id,
    status: mediaProcessingJobsTable.status,
    updatedAt: mediaProcessingJobsTable.updated_at,
  }).from(mediaProcessingJobsTable)
    .innerJoin(mediaAssetsTable, eq(mediaAssetsTable.id, mediaProcessingJobsTable.media_asset_id))
    .where(and(
      eq(mediaProcessingJobsTable.media_asset_id, mediaAssetId),
      eq(mediaProcessingJobsTable.job_type, "thumbnail"),
      inArray(mediaProcessingJobsTable.status, ["queued", "failed"]),
      eq(mediaAssetsTable.status, "ready"),
    )).limit(1);
  if (!pending) return false;
  if (!publisher) throw new Error("Media-processing queue is unavailable.");
  let queuedAt = pending.updatedAt;
  if (pending.status === "failed") {
    queuedAt = new Date(Math.max(Date.now(), pending.updatedAt.getTime() + 1));
    const [requeued] = await database.update(mediaProcessingJobsTable).set({
      status: "queued",
      error: null,
      started_at: null,
      completed_at: null,
      updated_at: queuedAt,
    }).where(and(
      eq(mediaProcessingJobsTable.id, pending.id),
      eq(mediaProcessingJobsTable.status, "failed"),
    )).returning({ updatedAt: mediaProcessingJobsTable.updated_at });
    if (!requeued) return false;
    queuedAt = requeued.updatedAt;
  }
  await publisher.add(
    "thumbnail",
    { mediaAssetId, jobType: "thumbnail" } satisfies MediaProcessingJobData,
    { jobId: `media-${mediaAssetId}-thumbnail-cover-${queuedAt.getTime()}` },
  );
  return true;
}

/**
 * Re-runs only the thumbnail job after a user selects a new video cover frame.
 * Keep playback and the previous thumbnail available until the replacement is
 * stored. The queued database row is recoverable if Redis publication fails.
 */
export async function regenerateMediaAssetThumbnail(
  mediaAssetId: number,
  publisher: Pick<NonNullable<typeof mediaProcessingQueue>, "add"> | null = mediaProcessingQueue,
  database: typeof db = db,
): Promise<boolean> {
  let queuedAt = new Date();
  const changed = await database.transaction(async (tx) => {
    const [asset] = await tx.select({
      id: mediaAssetsTable.id,
      media_type: mediaAssetsTable.media_type,
      status: mediaAssetsTable.status,
    }).from(mediaAssetsTable).where(eq(mediaAssetsTable.id, mediaAssetId)).limit(1).for("update");
    if (!asset || asset.media_type !== "video" || asset.status !== "ready") return false;
    const [previousJob] = await tx.select({
      updatedAt: mediaProcessingJobsTable.updated_at,
    }).from(mediaProcessingJobsTable).where(and(
      eq(mediaProcessingJobsTable.media_asset_id, mediaAssetId),
      eq(mediaProcessingJobsTable.job_type, "thumbnail"),
    )).limit(1).for("update");
    queuedAt = new Date(Math.max(Date.now(), (previousJob?.updatedAt.getTime() ?? 0) + 1));
    await tx.update(mediaAssetsTable).set({
      updated_at: queuedAt,
    }).where(eq(mediaAssetsTable.id, mediaAssetId));
    await tx.insert(mediaProcessingJobsTable)
      .values({ media_asset_id: mediaAssetId, job_type: "thumbnail", status: "queued" })
      .onConflictDoNothing({
        target: [mediaProcessingJobsTable.media_asset_id, mediaProcessingJobsTable.job_type],
      });
    await tx.update(mediaProcessingJobsTable).set({
      status: "queued",
      error: null,
      started_at: null,
      completed_at: null,
      updated_at: queuedAt,
    }).where(and(
      eq(mediaProcessingJobsTable.media_asset_id, mediaAssetId),
      eq(mediaProcessingJobsTable.job_type, "thumbnail"),
    ));
    return true;
  });
  if (!changed) return false;
  return enqueuePendingMediaAssetThumbnail(mediaAssetId, publisher, database);
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
  const queuedThumbnailJobs = await db.select({
    jobId: mediaProcessingJobsTable.id,
    mediaAssetId: mediaAssetsTable.id,
    updatedAt: mediaProcessingJobsTable.updated_at,
  }).from(mediaProcessingJobsTable)
    .innerJoin(mediaAssetsTable, eq(mediaAssetsTable.id, mediaProcessingJobsTable.media_asset_id))
    .where(and(
      eq(mediaProcessingJobsTable.job_type, "thumbnail"),
      eq(mediaProcessingJobsTable.status, "queued"),
      eq(mediaAssetsTable.status, "ready"),
    )).limit(limit);
  for (const pending of queuedThumbnailJobs) {
    try {
      await mediaProcessingQueue.add(
        "thumbnail",
        { mediaAssetId: pending.mediaAssetId, jobType: "thumbnail" } satisfies MediaProcessingJobData,
        { jobId: `media-${pending.mediaAssetId}-thumbnail-cover-${pending.updatedAt.getTime()}` },
      );
      republished += 1;
    } catch (error) {
      logger.warn({ err: error, mediaAssetId: pending.mediaAssetId }, "media-processing: pending thumbnail republish failed");
    }
  }
  return republished;
}