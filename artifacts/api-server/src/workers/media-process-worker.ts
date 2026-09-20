import { Worker, type Job } from "bullmq";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  db,
  mediaAssetsTable,
  mediaProcessingJobsTable,
  type MediaJobType,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { getRedisConnection, QUEUE } from "../lib/queue";
import { getAssetBuffer, putAsset } from "../lib/storage";
import { inspectMedia } from "../lib/media-validation";
import { logger } from "../lib/logger";
import { assertSupportedMediaJob, mediaJobsForType } from "../lib/media-platform";
import { trackWorker } from "../lib/worker-lifecycle";

const execFileAsync = promisify(execFile);
const MAX_PROCESSING_BYTES = 100 * 1024 * 1024;

type MediaJobData = { mediaAssetId: number; jobType: MediaJobType };

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(process.env["FFMPEG_PATH"] ?? "ffmpeg", args, {
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

async function markReadyIfComplete(mediaAssetId: number, mediaType: string, compositionManifest: Parameters<typeof mediaJobsForType>[1]): Promise<void> {
  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, mediaAssetId)).limit(1);
  if (!asset || asset.status === "failed" || asset.status === "deleted") return;
  const jobs = await db.select({ job_type: mediaProcessingJobsTable.job_type, status: mediaProcessingJobsTable.status })
    .from(mediaProcessingJobsTable)
    .where(eq(mediaProcessingJobsTable.media_asset_id, mediaAssetId));
  const required = new Set(mediaJobsForType(mediaType, compositionManifest));
  if ([...required].every((type) => jobs.some((job) => job.job_type === type && job.status === "completed"))) {
    await db.update(mediaAssetsTable)
      .set({ status: "ready", failure_reason: null, updated_at: new Date() })
      .where(eq(mediaAssetsTable.id, mediaAssetId));
  }
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
  if (!asset) throw new Error(`media asset ${mediaAssetId} not found`);
  await db.update(mediaAssetsTable).set({
    status: "processing",
    failure_reason: null,
    updated_at: new Date(),
  }).where(eq(mediaAssetsTable.id, mediaAssetId));

  let tempDir: string | undefined;
  try {
    const original = await getAssetBuffer(asset.original_key);
    if (original.length === 0 || original.length > MAX_PROCESSING_BYTES) {
      throw new Error("media asset is empty or exceeds the processing limit");
    }

    if (jobType === "probe") {
      const metadata = await inspectMedia(original, asset.mime_type);
      if (!metadata && !asset.mime_type.startsWith("application/")) {
        throw new Error("FFprobe or media inspection could not read the asset");
      }
      await db.update(mediaAssetsTable).set({
        width: metadata?.width ?? asset.width,
        height: metadata?.height ?? asset.height,
        duration_ms: metadata?.duration_ms ?? asset.duration_ms,
        metadata: { ...asset.metadata, probed: true },
        updated_at: new Date(),
      }).where(eq(mediaAssetsTable.id, mediaAssetId));
    } else {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-media-"));
      const input = path.join(tempDir, "original");
      await writeFile(input, original);

      if (jobType === "thumbnail") {
        const output = path.join(tempDir, "thumbnail.jpg");
        await runFfmpeg([
          "-y", "-i", input, "-frames:v", "1",
          "-vf", "scale=w='min(640,iw)':h=-2",
          "-q:v", "4", output,
        ]);
        const key = `media-assets/${asset.id}/thumbnail.jpg`;
        await putAsset(key, await readFile(output), "image/jpeg");
        await db.update(mediaAssetsTable).set({ thumbnail_key: key, updated_at: new Date() })
          .where(eq(mediaAssetsTable.id, mediaAssetId));
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
        await putAsset(key, await readFile(output), "video/mp4");
        await db.update(mediaAssetsTable).set({ variant_key: key, updated_at: new Date() })
          .where(eq(mediaAssetsTable.id, mediaAssetId));
      } else if (jobType === "audio_mix") {
        if (!asset.mime_type.startsWith("video/")) throw new Error("audio_mix is only valid for video assets");
        const music = asset.composition_manifest?.music;
        if (!music?.track_key || music.licensed !== true) {
          throw new Error("audio_mix requires an explicitly licensed track_key");
        }
        if (!music.track_key.startsWith("media-assets/")) {
          throw new Error("audio_mix track_key is outside the media asset namespace");
        }
        const musicBuffer = await getAssetBuffer(music.track_key);
        if (musicBuffer.length === 0 || musicBuffer.length > MAX_PROCESSING_BYTES) {
          throw new Error("audio track is empty or exceeds the processing limit");
        }
        const musicInput = path.join(tempDir, "music");
        const output = path.join(tempDir, "variant-mixed.mp4");
        await writeFile(musicInput, musicBuffer);
        const volume = Math.min(Math.max(Number(music.volume ?? 1), 0), 2);
        let hasOriginalAudio = false;
        try {
          const probe = await execFileAsync(process.env["FFPROBE_PATH"] ?? "ffprobe", [
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
        await putAsset(key, await readFile(output), "video/mp4");
        await db.update(mediaAssetsTable).set({ variant_key: key, updated_at: new Date() })
          .where(eq(mediaAssetsTable.id, mediaAssetId));
      }
    }

    await db.update(mediaProcessingJobsTable).set({
      status: "completed",
      completed_at: new Date(),
      error: null,
      updated_at: new Date(),
    }).where(eq(mediaProcessingJobsTable.id, claimed.id));
    await markReadyIfComplete(mediaAssetId, asset.media_type, asset.composition_manifest);
    logger.info({ mediaAssetId, jobType }, "media-processing: job completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(mediaProcessingJobsTable).set({
      status: "failed",
      error: message.slice(0, 2_000),
      updated_at: new Date(),
    }).where(eq(mediaProcessingJobsTable.id, claimed.id));
    await db.update(mediaAssetsTable).set({
      status: "failed",
      failure_reason: message.slice(0, 2_000),
      updated_at: new Date(),
    }).where(eq(mediaAssetsTable.id, mediaAssetId));
    throw error;
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

export function startMediaProcessWorker(): Worker<MediaJobData> | null {
  const connection = getRedisConnection();
  if (!connection) return null;
  const worker = new Worker<MediaJobData>(QUEUE.MEDIA_PROCESSING, processMediaJob, {
    connection,
    concurrency: 2,
  });
  worker.on("failed", (job, error) => {
    logger.error({ err: error, mediaAssetId: job?.data.mediaAssetId, jobType: job?.data.jobType }, "media-processing: BullMQ job failed");
  });
  return trackWorker(worker) ?? null;
}