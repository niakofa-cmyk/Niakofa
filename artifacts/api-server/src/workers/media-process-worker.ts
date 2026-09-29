import { Worker, type Job } from "bullmq";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  db,
  mediaAssetsTable,
  mediaProcessingJobsTable,
  type MediaJobType,
} from "@workspace/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getRedisConnection, QUEUE } from "../lib/queue";
import { deleteAssetStrict, getAssetBuffer, getAssetInfo, putAsset } from "../lib/storage";
import { isAllowedMediaSize, MAX_MEDIA_BYTES, validateMediaBuffer } from "../lib/media-validation";
import { logger } from "../lib/logger";
import { assertSupportedMediaJob, mediaJobsForType } from "../lib/media-platform";
import { trackWorker } from "../lib/worker-lifecycle";
import { randomUUID } from "node:crypto";
import { getMediaToolPaths } from "../lib/mediaCapabilities";

const execFileAsync = promisify(execFile);
type MediaJobData = { mediaAssetId: number; jobType: MediaJobType };
const mediaToolPaths = getMediaToolPaths();

async function storeGeneratedAsset(
  mediaAssetId: number,
  field: "thumbnail_key" | "variant_key",
  key: string,
  bytes: Buffer,
  mimeType: string,
  expectedCoverTimeMs?: number | null,
): Promise<"stored" | "deleted" | "superseded"> {
  // Serialize object creation with deletion's media-row lock. Either the
  // worker registers the new key before deletion snapshots keys, or it sees
  // the deleted state and never creates the object.
  return db.transaction(async (tx) => {
    const [asset] = await tx.select({
      status: mediaAssetsTable.status,
      composition_manifest: mediaAssetsTable.composition_manifest,
    })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1)
      .for("update");
    if (!asset || asset.status === "deleted") return "deleted";
    if (expectedCoverTimeMs !== undefined
      && (asset.composition_manifest?.cover_time_ms ?? null) !== expectedCoverTimeMs) return "superseded";
    // Register the provider key before the external write. If deletion wins
    // later, its tombstone has a durable reconciliation list even when this
    // worker is interrupted before the generated column is committed.
    await tx.update(mediaAssetsTable).set({
      cleanup_keys: sql`CASE
        WHEN ${mediaAssetsTable.cleanup_keys} @> jsonb_build_array(${key})
          THEN ${mediaAssetsTable.cleanup_keys}
        ELSE ${mediaAssetsTable.cleanup_keys} || jsonb_build_array(${key})
      END`,
      updated_at: new Date(),
    }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    await putAsset(key, bytes, mimeType);
    const [updated] = await tx.update(mediaAssetsTable)
      .set({ [field]: key, updated_at: new Date() })
      .where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")))
      .returning({ id: mediaAssetsTable.id });
    if (!updated) {
      await deleteAssetStrict(key);
      return "deleted";
    }
    return "stored";
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(mediaToolPaths.ffmpeg, args, {
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

async function readBoundedOutput(filePath: string): Promise<Buffer> {
  const fileInfo = await stat(filePath);
  if (!isAllowedMediaSize(fileInfo.size)) throw new Error("MEDIA_SIZE_INVALID");
  const buffer = await readFile(filePath);
  if (buffer.length !== fileInfo.size || !isAllowedMediaSize(buffer.length)) {
    throw new Error("MEDIA_SIZE_INVALID");
  }
  return buffer;
}

async function completeClaimedJob(
  mediaAssetId: number,
  jobId: number,
  mediaType: string,
  compositionManifest: Parameters<typeof mediaJobsForType>[1],
  expectedCoverTimeMs?: number | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Deletion takes this same asset lock. Exactly one transition wins:
    // deletion produces a tombstone, or completion can advance to ready.
    const [asset] = await tx.select({
      status: mediaAssetsTable.status,
      composition_manifest: mediaAssetsTable.composition_manifest,
    })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1)
      .for("update");
    if (!asset || asset.status === "deleted") {
      await tx.update(mediaProcessingJobsTable).set({
        status: "cancelled",
        error: "MEDIA_ASSET_DELETED",
        completed_at: new Date(),
        updated_at: new Date(),
      }).where(eq(mediaProcessingJobsTable.id, jobId));
      return false;
    }
    if (expectedCoverTimeMs !== undefined
      && (asset.composition_manifest?.cover_time_ms ?? null) !== expectedCoverTimeMs) return false;
    const [completedJob] = await tx.update(mediaProcessingJobsTable).set({
      status: "completed",
      completed_at: new Date(),
      error: null,
      updated_at: new Date(),
    }).where(and(
      eq(mediaProcessingJobsTable.id, jobId),
      eq(mediaProcessingJobsTable.status, "processing"),
    )).returning({ id: mediaProcessingJobsTable.id });
    if (!completedJob) return false;
    const jobs = await tx.select({
      job_type: mediaProcessingJobsTable.job_type,
      status: mediaProcessingJobsTable.status,
    }).from(mediaProcessingJobsTable)
      .where(eq(mediaProcessingJobsTable.media_asset_id, mediaAssetId));
    const required = new Set(mediaJobsForType(mediaType, compositionManifest));
    if ([...required].every((type) => jobs.some((job) => job.job_type === type && job.status === "completed"))) {
      await tx.update(mediaAssetsTable).set({
        status: "ready",
        failure_reason: null,
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    }
    return true;
  });
}

async function cancelClaimedJob(jobId: number): Promise<void> {
  await db.update(mediaProcessingJobsTable).set({
    status: "cancelled",
    error: "MEDIA_ASSET_DELETED",
    completed_at: new Date(),
    updated_at: new Date(),
  }).where(eq(mediaProcessingJobsTable.id, jobId));
}

async function processMediaJob(job: Job<MediaJobData>): Promise<void> {
  const { mediaAssetId, jobType } = job.data;
  assertSupportedMediaJob(jobType);

  const [claimed] = await db.update(mediaProcessingJobsTable)
    .set({
      status: "processing",
      attempts: job.attemptsMade + 1,
      started_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(
      eq(mediaProcessingJobsTable.media_asset_id, mediaAssetId),
      eq(mediaProcessingJobsTable.job_type, jobType),
      inArray(mediaProcessingJobsTable.status, ["queued", "failed"]),
    ))
    .returning();
  if (!claimed) return;

  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, mediaAssetId)).limit(1);
  if (!asset || asset.status === "deleted") {
    await cancelClaimedJob(claimed.id);
    return;
  }
  const preservesReadyVideo = jobType === "thumbnail" && asset.media_type === "video" && asset.status === "ready";
  const requestedCoverTimeMs = jobType === "thumbnail" && asset.media_type === "video"
    ? Number.isFinite(asset.composition_manifest?.cover_time_ms)
      ? Math.max(0, asset.composition_manifest!.cover_time_ms!)
      : null
    : undefined;
  let tempDir: string | undefined;
  const generatedKeys: string[] = [];
  try {
    if (!isAllowedMediaSize(asset.byte_size)) throw new Error("MEDIA_SIZE_INVALID");
    const originalInfo = await getAssetInfo(asset.original_key);
    if (!originalInfo || !isAllowedMediaSize(originalInfo.contentLength) || originalInfo.contentLength !== asset.byte_size) {
      throw new Error("MEDIA_SIZE_INVALID");
    }
    const original = await getAssetBuffer(asset.original_key, MAX_MEDIA_BYTES);
    if (original.length !== asset.byte_size || !isAllowedMediaSize(original.length)) {
      throw new Error("MEDIA_SIZE_INVALID");
    }
    const metadata = await validateMediaBuffer(original, asset.media_type, asset.mime_type);
    await db.update(mediaAssetsTable).set({
      status: preservesReadyVideo ? "ready" : "processing",
      ...(preservesReadyVideo ? {} : { failure_reason: null }),
      width: metadata.width,
      height: metadata.height,
      duration_ms: metadata.duration_ms,
      metadata: { ...asset.metadata, signature_validated: true },
      updated_at: new Date(),
    }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));

    if (jobType === "probe") {
      await db.update(mediaAssetsTable).set({
        width: metadata.width,
        height: metadata.height,
        duration_ms: metadata.duration_ms,
        metadata: { ...asset.metadata, probed: true },
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    } else {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-media-"));
      const input = path.join(tempDir, "original");
      await writeFile(input, original);

      if (jobType === "thumbnail") {
        const output = path.join(tempDir, "thumbnail.jpg");
        const coverTimeMs = requestedCoverTimeMs ?? null;
        const jobSuffix = String(job.id ?? randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(-48);
        await runFfmpeg([
          "-y",
          "-i", input,
          ...(coverTimeMs !== null ? ["-ss", String(coverTimeMs / 1000)] : []),
          "-frames:v", "1",
          "-vf", "scale=w='min(640,iw)':h=-2",
          "-q:v", "4", output,
        ]);
        const key = coverTimeMs === null
          ? `media-assets/${asset.id}/thumbnail.jpg`
          : `media-assets/${asset.id}/thumbnail-${coverTimeMs}-${jobSuffix}.jpg`;
        const previousThumbnailKey = asset.thumbnail_key;
        const outputBuffer = await readBoundedOutput(output);
        await validateMediaBuffer(outputBuffer, "photo", "image/jpeg");
        generatedKeys.push(key);
        const stored = await storeGeneratedAsset(
          mediaAssetId,
          "thumbnail_key",
          key,
          outputBuffer,
          "image/jpeg",
          requestedCoverTimeMs,
        );
        if (stored === "superseded") {
          logger.info({ mediaAssetId, jobType, requestedCoverTimeMs }, "media-processing: cover thumbnail superseded by a newer selection");
          return;
        }
        if (stored !== "stored") {
          throw new Error("MEDIA_ASSET_DELETED");
        }
        if (previousThumbnailKey && previousThumbnailKey !== key) {
          try {
            await deleteAssetStrict(previousThumbnailKey);
          } catch {
            logger.error({ mediaAssetId, jobType }, "media-processing: replaced thumbnail cleanup failed");
          }
        }
      } else if (jobType === "transcode") {
        if (!asset.mime_type.startsWith("video/")) throw new Error("transcode is only valid for video assets");
        const output = path.join(tempDir, "variant.mp4");
        const allowedEffects = new Set(["grayscale", "sepia", "blur"]);
        const effects = (asset.composition_manifest?.effects ?? [])
          .filter((effect): effect is string => typeof effect === "string" && allowedEffects.has(effect));
        const filter = effects.length
          ? effects.map((effect) => effect === "grayscale"
            ? "hue=s=0"
            : effect === "sepia"
            ? "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"
            : "boxblur=2:1").join(",")
          : null;
        await runFfmpeg([
          "-y", "-i", input, "-c:v", "libx264", "-preset", "veryfast",
          "-crf", "23", "-pix_fmt", "yuv420p",
          ...(filter ? ["-vf", filter] : []),
          "-c:a", "aac",
          "-movflags", "+faststart", output,
        ]);
        const key = `media-assets/${asset.id}/variant.mp4`;
        const outputBuffer = await readBoundedOutput(output);
        await validateMediaBuffer(outputBuffer, "video", "video/mp4");
        generatedKeys.push(key);
        if ((await storeGeneratedAsset(mediaAssetId, "variant_key", key, outputBuffer, "video/mp4")) !== "stored") {
          throw new Error("MEDIA_ASSET_DELETED");
        }
      } else if (jobType === "audio_mix") {
        if (!asset.mime_type.startsWith("video/")) throw new Error("audio_mix is only valid for video assets");
        const music = asset.composition_manifest?.music;
        if (!music?.track_key || music.licensed !== true) {
          throw new Error("audio_mix requires an explicitly licensed track_key");
        }
        if (!music.track_key.startsWith("media-assets/")) {
          throw new Error("audio_mix track_key is outside the media asset namespace");
        }
        const musicInfo = await getAssetInfo(music.track_key);
        if (!musicInfo || !isAllowedMediaSize(musicInfo.contentLength)) throw new Error("MEDIA_SIZE_INVALID");
        const musicBuffer = await getAssetBuffer(music.track_key, MAX_MEDIA_BYTES);
        if (musicBuffer.length === 0 || musicBuffer.length !== musicInfo.contentLength || musicBuffer.length > MAX_MEDIA_BYTES) {
          throw new Error("audio track is empty or exceeds the processing limit");
        }
        const musicInput = path.join(tempDir, "music");
        const output = path.join(tempDir, "variant-mixed.mp4");
        await writeFile(musicInput, musicBuffer);
        const volume = Math.min(Math.max(Number(music.volume ?? 1), 0), 2);
        let hasOriginalAudio = false;
        try {
          const probe = await execFileAsync(mediaToolPaths.ffprobe, [
            "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=index", "-of", "csv=p=0", input,
          ], { timeout: 10_000 });
          hasOriginalAudio = Boolean(probe.stdout.trim());
        } catch {
          hasOriginalAudio = false;
        }
        const mixArgs = hasOriginalAudio
          ? [
            "-filter_complex", `[0:a]volume=1[original];[1:a]volume=${volume}[music];[original][music]amix=inputs=2:duration=first:dropout_transition=2[a]`,
            "-map", "0:v:0", "-map", "[a]",
          ]
          : ["-map", "0:v:0", "-map", "1:a:0"];
        await runFfmpeg([
          "-y", "-i", input, "-stream_loop", "-1", "-i", musicInput,
          ...mixArgs, "-c:v", "copy", "-c:a", "aac", "-shortest",
          "-movflags", "+faststart", output,
        ]);
        const key = `media-assets/${asset.id}/variant-mixed.mp4`;
        const outputBuffer = await readBoundedOutput(output);
        await validateMediaBuffer(outputBuffer, "video", "video/mp4");
        generatedKeys.push(key);
        if ((await storeGeneratedAsset(mediaAssetId, "variant_key", key, outputBuffer, "video/mp4")) !== "stored") {
          throw new Error("MEDIA_ASSET_DELETED");
        }
      }
    }

    const [currentAsset] = await db.select({ status: mediaAssetsTable.status })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1);
    if (!currentAsset || currentAsset.status === "deleted") {
      await cancelClaimedJob(claimed.id);
      return;
    }

    if (!(await completeClaimedJob(
      mediaAssetId,
      claimed.id,
      asset.media_type,
      asset.composition_manifest,
      requestedCoverTimeMs,
    ))) return;
    logger.info({ mediaAssetId, jobType }, "media-processing: job completed");
  } catch (error) {
    const requestId = randomUUID();
    const message = error instanceof Error && error.message === "STORAGE_OBJECT_TOO_LARGE"
      ? "MEDIA_SIZE_INVALID"
      : error instanceof Error && /^MEDIA_[A-Z_]+$/.test(error.message)
      ? error.message
      : "MEDIA_PROCESSING_FAILED";
    let generatedCleanupSucceeded = true;
    for (const key of generatedKeys) {
      try {
        await deleteAssetStrict(key);
      } catch {
        generatedCleanupSucceeded = false;
        logger.error({ requestId, mediaAssetId, jobType }, "media-processing: generated variant cleanup failed");
      }
    }
    if (generatedKeys.length && generatedCleanupSucceeded && !preservesReadyVideo) {
      await db.update(mediaAssetsTable).set({
        ...(generatedKeys.some((key) => /\/thumbnail(?:-[^/]+)?\.jpg$/.test(key)) ? { thumbnail_key: null } : {}),
        ...(generatedKeys.some((key) => key.endsWith("/variant.mp4") || key.endsWith("/variant-mixed.mp4")) ? { variant_key: null } : {}),
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    }
    if (requestedCoverTimeMs !== undefined) {
      const failureIsCurrent = await db.transaction(async (tx) => {
        const [current] = await tx.select({
          status: mediaAssetsTable.status,
          composition_manifest: mediaAssetsTable.composition_manifest,
        }).from(mediaAssetsTable)
          .where(eq(mediaAssetsTable.id, mediaAssetId))
          .limit(1)
          .for("update");
        if (!current || current.status === "deleted") {
          await tx.update(mediaProcessingJobsTable).set({
            status: "cancelled",
            error: "MEDIA_ASSET_DELETED",
            completed_at: new Date(),
            updated_at: new Date(),
          }).where(eq(mediaProcessingJobsTable.id, claimed.id));
          return false;
        }
        if ((current.composition_manifest?.cover_time_ms ?? null) !== requestedCoverTimeMs) return false;
        await tx.update(mediaProcessingJobsTable).set({
          status: "failed",
          error: message,
          updated_at: new Date(),
        }).where(and(
          eq(mediaProcessingJobsTable.id, claimed.id),
          eq(mediaProcessingJobsTable.status, "processing"),
        ));
        return true;
      });
      if (!failureIsCurrent) {
        logger.info({ mediaAssetId, jobType, requestedCoverTimeMs }, "media-processing: stale cover job failure ignored");
        return;
      }
    } else {
      await db.update(mediaProcessingJobsTable).set({
        status: "failed",
        error: message,
        updated_at: new Date(),
      }).where(eq(mediaProcessingJobsTable.id, claimed.id));
    }
    if (!preservesReadyVideo) {
      await db.update(mediaAssetsTable).set({
        status: "failed",
        failure_reason: `${message};request_id=${requestId}`,
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    }
    logger.error({ requestId, mediaAssetId, jobType, failureCode: message }, "media-processing: job failed");
    throw new Error(`${message}; request_id=${requestId}`);
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

export function startMediaProcessWorker(): Worker<MediaJobData> | null {
  const connection = getRedisConnection();
  if (!connection) return null;
  const worker = new Worker<MediaJobData>(QUEUE.MEDIA_PROCESSING, processMediaJob, {
    connection,
    concurrency: 1,
  });
  worker.on("failed", (job, error) => {
    logger.error({ mediaAssetId: job?.data.mediaAssetId, jobType: job?.data.jobType, failureCode: error.message.split(";")[0] }, "media-processing: BullMQ job failed");
  });
  return trackWorker(worker) ?? null;
}