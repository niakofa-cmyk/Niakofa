import { Worker, type Job } from "bullmq";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  communityStoryMediaTable,
  communityStoryMomentCompositionsTable,
  communityStoriesTable,
  db,
  mediaAssetsTable,
  mediaProcessingJobsTable,
  type MediaJobType,
} from "@workspace/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getRedisConnection, QUEUE } from "../lib/queue";
import { deleteAssetStrict, getAssetBuffer, getAssetInfo, putAsset } from "../lib/storage";
import { isAllowedMediaSize, MAX_MEDIA_BYTES, validateMediaBuffer } from "../lib/media-validation";
import { mediaProcessingErrorDetails } from "../lib/media-processing-diagnostics";
import { logger } from "../lib/logger";
import { assertSupportedMediaJob, isMediaPlatformV21Enabled, isMomentMusicAsset, mediaJobsForType } from "../lib/media-platform";
import { trackWorker } from "../lib/worker-lifecycle";
import { workerFailed, workerStarted, workerStopped } from "../lib/worker-registry";
import {
  monitorMediaWorker,
  type MediaWorkerBlockingConnection,
  type MediaWorkerLifecycleEmitter,
  type MediaWorkerStartup,
} from "../lib/media-worker-lifecycle";
import { randomUUID } from "node:crypto";
import { getMediaToolPaths } from "../lib/mediaCapabilities";
import {
  isPublishedStoryMediaContext,
  momentCompositionAttemptOwnsJob,
  momentClipNormalizeArgs,
  momentComposeAttemptOutputKey,
  momentConcatArgs,
  reconcileMomentCompositionPromotion,
  withDurableCleanupLedger,
  withinMomentDurationLimit,
} from "../lib/moment-video-compose";

const execFileAsync = promisify(execFile);
type MediaJobData = { mediaAssetId: number; jobType: MediaJobType };
type MediaProcessingFailureStage =
  | "source_size_check"
  | "source_object_info"
  | "source_object_read"
  | "source_validation"
  | "source_metadata_update"
  | "probe_metadata_update"
  | "scratch_directory_create"
  | "source_scratch_write"
  | "thumbnail_ffmpeg"
  | "thumbnail_output_read"
  | "thumbnail_output_validation"
  | "thumbnail_store"
  | "transcode_precondition"
  | "transcode_ffmpeg"
  | "transcode_output_read"
  | "transcode_output_validation"
  | "transcode_store"
  | "audio_mix_precondition"
  | "audio_track_lookup"
  | "audio_track_info"
  | "audio_track_read"
  | "audio_track_validation"
  | "audio_track_scratch_write"
  | "audio_original_probe"
  | "audio_mix_ffmpeg"
  | "audio_mix_output_read"
  | "audio_mix_output_validation"
  | "audio_mix_store"
  | "completion_asset_read"
  | "completion_commit";
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
        WHEN ${mediaAssetsTable.cleanup_keys} @> jsonb_build_array(${key}::text)
          THEN ${mediaAssetsTable.cleanup_keys}
        ELSE ${mediaAssetsTable.cleanup_keys} || jsonb_build_array(${key}::text)
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

async function stageMomentCompositionOutput(
  storyId: number,
  mediaAssetId: number,
  jobId: number,
  attempt: number,
  key: string,
  bytes: Buffer,
): Promise<boolean> {
  // Each attempt has a unique key. Commit its cleanup ledger entry first in a
  // separate transaction; a provider PUT followed by a failed DB commit must
  // still leave a durable key for deletion/reconciliation to discover.
  return withDurableCleanupLedger(
    key,
    async (ledgerKey) => db.transaction(async (tx) => {
      const [story] = await tx.select({
        status: communityStoriesTable.status,
        expires_at: communityStoriesTable.expires_at,
      }).from(communityStoriesTable)
        .where(eq(communityStoriesTable.id, storyId))
        .limit(1)
        .for("share");
      if (!story || story.status !== "published" || story.expires_at <= new Date()) return false;
      const [asset] = await tx.select({ status: mediaAssetsTable.status })
        .from(mediaAssetsTable)
        .where(eq(mediaAssetsTable.id, mediaAssetId))
        .limit(1)
        .for("update");
      if (!asset || asset.status === "deleted") return false;
      const [job] = await tx.select({
        status: mediaProcessingJobsTable.status,
        attempts: mediaProcessingJobsTable.attempts,
      }).from(mediaProcessingJobsTable)
        .where(eq(mediaProcessingJobsTable.id, jobId))
        .limit(1)
        .for("update");
      if (!job || !momentCompositionAttemptOwnsJob(job.status, job.attempts, attempt)) return false;
      await tx.update(mediaAssetsTable).set({
        cleanup_keys: sql`CASE
          WHEN ${mediaAssetsTable.cleanup_keys} @> jsonb_build_array(${ledgerKey}::text)
            THEN ${mediaAssetsTable.cleanup_keys}
          ELSE ${mediaAssetsTable.cleanup_keys} || jsonb_build_array(${ledgerKey}::text)
        END`,
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
      return true;
    }),
    async () => db.transaction(async (tx) => {
      // Recheck lease and deletion state under the same lock order immediately
      // before the external write; phase one only guarantees cleanup coverage.
      const [story] = await tx.select({
        status: communityStoriesTable.status,
        expires_at: communityStoriesTable.expires_at,
      }).from(communityStoriesTable)
        .where(eq(communityStoriesTable.id, storyId))
        .limit(1)
        .for("share");
      if (!story || story.status !== "published" || story.expires_at <= new Date()) return false;
      const [asset] = await tx.select({ status: mediaAssetsTable.status })
        .from(mediaAssetsTable)
        .where(eq(mediaAssetsTable.id, mediaAssetId))
        .limit(1)
        .for("update");
      if (!asset || asset.status === "deleted") return false;
      const [job] = await tx.select({
        status: mediaProcessingJobsTable.status,
        attempts: mediaProcessingJobsTable.attempts,
      }).from(mediaProcessingJobsTable)
        .where(eq(mediaProcessingJobsTable.id, jobId))
        .limit(1)
        .for("update");
      if (!job || !momentCompositionAttemptOwnsJob(job.status, job.attempts, attempt)) return false;
      await putAsset(key, bytes, "video/mp4");
      return true;
    }),
  );
}

async function deleteMomentAttemptOutput(mediaAssetId: number, key: string): Promise<void> {
  // Keep the durable entry if provider deletion fails; retry/retention cleanup
  // can then reconcile it. Remove it only after strict absence is confirmed.
  await deleteAssetStrict(key);
  await db.update(mediaAssetsTable).set({
    cleanup_keys: sql`${mediaAssetsTable.cleanup_keys} - ${key}`,
    updated_at: new Date(),
  }).where(eq(mediaAssetsTable.id, mediaAssetId));
}

async function beginMomentCompositionAttempt(
  storyId: number,
  mediaAssetId: number,
  jobId: number,
  attempt: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [story] = await tx.select({
      status: communityStoriesTable.status,
      expires_at: communityStoriesTable.expires_at,
    }).from(communityStoriesTable)
      .where(eq(communityStoriesTable.id, storyId))
      .limit(1)
      .for("share");
    const [asset] = await tx.select({ status: mediaAssetsTable.status })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1)
      .for("update");
    const [claimedJob] = await tx.select({
      status: mediaProcessingJobsTable.status,
      attempts: mediaProcessingJobsTable.attempts,
    }).from(mediaProcessingJobsTable)
      .where(eq(mediaProcessingJobsTable.id, jobId))
      .limit(1)
      .for("update");
    if (!claimedJob || !momentCompositionAttemptOwnsJob(claimedJob.status, claimedJob.attempts, attempt)) return false;
    if (!story || story.status !== "published" || story.expires_at <= new Date()
      || !asset || asset.status === "deleted") {
      await tx.update(mediaProcessingJobsTable).set({
        status: "cancelled",
        error: "MEDIA_ASSET_DELETED",
        completed_at: new Date(),
        updated_at: new Date(),
      }).where(and(
        eq(mediaProcessingJobsTable.id, jobId),
        eq(mediaProcessingJobsTable.status, "processing"),
        eq(mediaProcessingJobsTable.attempts, attempt),
      ));
      return false;
    }
    await tx.update(communityStoryMomentCompositionsTable).set({
      status: "processing",
      failure_code: null,
      updated_at: new Date(),
    }).where(and(
      eq(communityStoryMomentCompositionsTable.story_id, storyId),
      ne(communityStoryMomentCompositionsTable.status, "ready"),
    ));
    await tx.update(mediaAssetsTable).set({
      status: "processing",
      failure_reason: null,
      updated_at: new Date(),
    }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    return true;
  });
}

async function completeMomentCompositionAttempt(
  storyId: number,
  mediaAssetId: number,
  jobId: number,
  attempt: number,
  outputKey: string,
  outputDurationMs: number,
  outputByteSize: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // This follows Story deletion's Story-then-asset lock order. Deletion
    // checks for a processing job while holding the Story lock.
    const [story] = await tx.select({
      status: communityStoriesTable.status,
      expires_at: communityStoriesTable.expires_at,
    }).from(communityStoriesTable)
      .where(eq(communityStoriesTable.id, storyId))
      .limit(1)
      .for("share");
    const [asset] = await tx.select({ status: mediaAssetsTable.status })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1)
      .for("update");
    if (!story || story.status !== "published" || story.expires_at <= new Date()
      || !asset || asset.status === "deleted") {
      await tx.update(mediaProcessingJobsTable).set({
        status: "cancelled",
        error: "MEDIA_ASSET_DELETED",
        completed_at: new Date(),
        updated_at: new Date(),
      }).where(and(
        eq(mediaProcessingJobsTable.id, jobId),
        eq(mediaProcessingJobsTable.status, "processing"),
        eq(mediaProcessingJobsTable.attempts, attempt),
      ));
      return false;
    }
    const [completedJob] = await tx.update(mediaProcessingJobsTable).set({
      status: "completed",
      error: null,
      completed_at: new Date(),
      updated_at: new Date(),
    }).where(and(
      eq(mediaProcessingJobsTable.id, jobId),
      eq(mediaProcessingJobsTable.status, "processing"),
      eq(mediaProcessingJobsTable.attempts, attempt),
    )).returning({ id: mediaProcessingJobsTable.id });
    if (!completedJob) return false;
    await tx.update(mediaAssetsTable).set({
      variant_key: outputKey,
      status: "ready",
      failure_reason: null,
      duration_ms: outputDurationMs,
      width: 1080,
      height: 1920,
      byte_size: outputByteSize,
      updated_at: new Date(),
    }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    await tx.update(communityStoryMomentCompositionsTable).set({
      status: "ready",
      failure_code: null,
      updated_at: new Date(),
    }).where(and(
      eq(communityStoryMomentCompositionsTable.story_id, storyId),
      ne(communityStoryMomentCompositionsTable.status, "ready"),
    ));
    return true;
  });
}

async function readMomentCompositionPromotionState(
  storyId: number,
  mediaAssetId: number,
  jobId: number,
): Promise<{
  job_status: string;
  job_attempt: number;
  asset_status: string;
  variant_key: string | null;
  composition_status: string;
} | null> {
  return db.transaction(async (tx) => {
    const [story] = await tx.select({ id: communityStoriesTable.id })
      .from(communityStoriesTable)
      .where(eq(communityStoriesTable.id, storyId))
      .limit(1)
      .for("share");
    if (!story) return null;
    const [asset] = await tx.select({
      status: mediaAssetsTable.status,
      variant_key: mediaAssetsTable.variant_key,
    }).from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1)
      .for("update");
    const [job] = await tx.select({
      status: mediaProcessingJobsTable.status,
      attempts: mediaProcessingJobsTable.attempts,
    }).from(mediaProcessingJobsTable)
      .where(eq(mediaProcessingJobsTable.id, jobId))
      .limit(1)
      .for("update");
    const [composition] = await tx.select({
      status: communityStoryMomentCompositionsTable.status,
    }).from(communityStoryMomentCompositionsTable)
      .where(eq(communityStoryMomentCompositionsTable.derived_media_asset_id, mediaAssetId))
      .limit(1)
      .for("update");
    if (!asset || !job || !composition) return null;
    return {
      job_status: job.status,
      job_attempt: job.attempts,
      asset_status: asset.status,
      variant_key: asset.variant_key,
      composition_status: composition.status,
    };
  });
}

async function failMomentCompositionAttempt(
  storyId: number | undefined,
  mediaAssetId: number,
  jobId: number,
  attempt: number,
  failure: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Preserve the Story -> asset lock order used by deletion and promotion.
    if (storyId !== undefined) {
      await tx.select({ id: communityStoriesTable.id }).from(communityStoriesTable)
        .where(eq(communityStoriesTable.id, storyId))
        .limit(1)
        .for("share");
    }
    const [asset] = await tx.select({ status: mediaAssetsTable.status })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1)
      .for("update");
    const [failedJob] = await tx.update(mediaProcessingJobsTable).set({
      status: "failed",
      error: failure,
      updated_at: new Date(),
    }).where(and(
      eq(mediaProcessingJobsTable.id, jobId),
      eq(mediaProcessingJobsTable.status, "processing"),
      eq(mediaProcessingJobsTable.attempts, attempt),
    )).returning({ id: mediaProcessingJobsTable.id });
    if (!failedJob) return false;
    if (asset && asset.status !== "deleted") {
      await tx.update(mediaAssetsTable).set({
        status: "failed",
        variant_key: null,
        failure_reason: failure,
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    }
    await tx.update(communityStoryMomentCompositionsTable).set({
      status: "failed",
      failure_code: failure,
      updated_at: new Date(),
    }).where(eq(communityStoryMomentCompositionsTable.derived_media_asset_id, mediaAssetId));
    return true;
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

async function cancelClaimedJob(jobId: number, attempt?: number): Promise<void> {
  await db.update(mediaProcessingJobsTable).set({
    status: "cancelled",
    error: "MEDIA_ASSET_DELETED",
    completed_at: new Date(),
    updated_at: new Date(),
  }).where(and(
    eq(mediaProcessingJobsTable.id, jobId),
    attempt === undefined ? undefined : eq(mediaProcessingJobsTable.status, "processing"),
    attempt === undefined ? undefined : eq(mediaProcessingJobsTable.attempts, attempt),
  ));
}

type ProbedStreams = { codec_type?: string; width?: number; height?: number };
async function probeCompositionFile(filePath: string): Promise<{ durationMs: number; streams: ProbedStreams[] }> {
  const result = await execFileAsync(mediaToolPaths.ffprobe, [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", filePath,
  ], { timeout: 10_000, maxBuffer: 256 * 1024 });
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: ProbedStreams[];
  };
  const seconds = Number(parsed.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("MEDIA_COMPOSITION_INVALID");
  return { durationMs: Math.round(seconds * 1000), streams: parsed.streams ?? [] };
}

async function processMomentComposition(mediaAssetId: number, jobId: number, attempt: number): Promise<void> {
  let tempDir: string | undefined;
  let generatedKey: string | undefined;
  let compositionStoryId: number | undefined;
  try {
    const [composition] = await db.select({
    story_id: communityStoryMomentCompositionsTable.story_id,
    source_ids: communityStoryMomentCompositionsTable.source_media_asset_ids,
    status: communityStoryMomentCompositionsTable.status,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    audience: communityStoriesTable.audience,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    story_status: communityStoriesTable.status,
    expires_at: communityStoriesTable.expires_at,
    owner_user_id: mediaAssetsTable.owner_user_id,
    }).from(communityStoryMomentCompositionsTable)
      .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMomentCompositionsTable.story_id))
      .innerJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMomentCompositionsTable.derived_media_asset_id))
      .where(eq(communityStoryMomentCompositionsTable.derived_media_asset_id, mediaAssetId))
      .limit(1);
    if (!composition) {
      await db.update(mediaProcessingJobsTable).set({
        status: "cancelled",
        error: "MEDIA_COMPOSITION_NOT_FOUND",
        completed_at: new Date(),
        updated_at: new Date(),
      }).where(and(
        eq(mediaProcessingJobsTable.id, jobId),
        eq(mediaProcessingJobsTable.status, "processing"),
        eq(mediaProcessingJobsTable.attempts, attempt),
      ));
      return;
    }
    compositionStoryId = composition.story_id;
    if (!(await beginMomentCompositionAttempt(composition.story_id, mediaAssetId, jobId, attempt))) return;
    if (composition.story_status !== "published" || composition.expires_at <= new Date()
      || composition.exchange_listing_id !== null || composition.owner_user_id !== composition.author_user_id
      || !Array.isArray(composition.source_ids) || composition.source_ids.length < 2
      || composition.source_ids.length > 6
      || composition.source_ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw new Error("MEDIA_COMPOSITION_INVALID");
    }
    const sourceIds = composition.source_ids as number[];
    const sources = await db.select({
      id: mediaAssetsTable.id,
      owner_user_id: mediaAssetsTable.owner_user_id,
      context_kind: mediaAssetsTable.context_kind,
      context_id: mediaAssetsTable.context_id,
      media_type: mediaAssetsTable.media_type,
      mime_type: mediaAssetsTable.mime_type,
      original_key: mediaAssetsTable.original_key,
      byte_size: mediaAssetsTable.byte_size,
      status: mediaAssetsTable.status,
    }).from(mediaAssetsTable).where(inArray(mediaAssetsTable.id, sourceIds));
    const attached = await db.select({ media_asset_id: communityStoryMediaTable.media_asset_id })
      .from(communityStoryMediaTable)
      .where(and(
        eq(communityStoryMediaTable.story_id, composition.story_id),
        inArray(communityStoryMediaTable.media_asset_id, sourceIds),
      ));
    if (sources.length !== sourceIds.length || attached.length !== sourceIds.length
      || sources.some((source) => source.owner_user_id !== composition.owner_user_id
        || !isPublishedStoryMediaContext(source.context_kind, source.context_id, composition.story_id)
        || source.media_type !== "video" || !source.mime_type.startsWith("video/")
        || source.status !== "ready")) {
      throw new Error("MEDIA_COMPOSITION_SOURCE_INVALID");
    }

    tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-moment-compose-"));
    const probedDurations: number[] = [];
    const probedInputs: Array<{ inputPath: string; durationMs: number; hasAudio: boolean }> = [];
    for (const [index, sourceId] of sourceIds.entries()) {
      const source = sources.find((item) => item.id === sourceId)!;
      if (!isAllowedMediaSize(source.byte_size)) throw new Error("MEDIA_SIZE_INVALID");
      const info = await getAssetInfo(source.original_key);
      if (!info || info.contentLength !== source.byte_size || !isAllowedMediaSize(info.contentLength)) {
        throw new Error("MEDIA_SIZE_INVALID");
      }
      const buffer = await getAssetBuffer(source.original_key, MAX_MEDIA_BYTES);
      if (buffer.length !== source.byte_size || !isAllowedMediaSize(buffer.length)) throw new Error("MEDIA_SIZE_INVALID");
      await validateMediaBuffer(buffer, "video", source.mime_type);
      const inputPath = path.join(tempDir, `source-${index + 1}`);
      await writeFile(inputPath, buffer);
      const probed = await probeCompositionFile(inputPath);
      if (!probed.streams.some((stream) => stream.codec_type === "video")) {
        throw new Error("MEDIA_COMPOSITION_SOURCE_INVALID");
      }
      probedDurations.push(probed.durationMs);
      if (probed.durationMs > 60_000
        || probedDurations.reduce((total, duration) => total + duration, 0) > 60_000) {
        throw new Error("MEDIA_COMPOSITION_DURATION_INVALID");
      }
      probedInputs.push({
        inputPath,
        durationMs: probed.durationMs,
        hasAudio: probed.streams.some((stream) => stream.codec_type === "audio"),
      });
    }
    if (!withinMomentDurationLimit(probedDurations)) throw new Error("MEDIA_COMPOSITION_DURATION_INVALID");

    const normalizedPaths: string[] = [];
    for (const [index, input] of probedInputs.entries()) {
      const normalizedPath = path.join(tempDir, `normalized-${index + 1}.mp4`);
      await runFfmpeg(momentClipNormalizeArgs(
        input.inputPath,
        normalizedPath,
        input.durationMs,
        input.hasAudio,
      ));
      normalizedPaths.push(normalizedPath);
    }

    const concatFile = path.join(tempDir, "clips.txt");
    await writeFile(concatFile, normalizedPaths.map((file) => `file ${file}`).join("\n") + "\n");
    const outputPath = path.join(tempDir, "moment.mp4");
    await runFfmpeg(momentConcatArgs(concatFile, outputPath, normalizedPaths.length));
    const outputBuffer = await readBoundedOutput(outputPath);
    await validateMediaBuffer(outputBuffer, "video", "video/mp4");
    const outputProbe = await probeCompositionFile(outputPath);
    if (outputProbe.durationMs > 61_000
      || !outputProbe.streams.some((stream) => stream.codec_type === "video")
      || !outputProbe.streams.some((stream) => stream.codec_type === "audio")) {
      throw new Error("MEDIA_COMPOSITION_OUTPUT_INVALID");
    }
    for (const stream of outputProbe.streams) {
      if (stream.codec_type === "video"
        && (!Number.isSafeInteger(stream.width) || !Number.isSafeInteger(stream.height)
          || stream.width! > 1920 || stream.height! > 1920)) {
        throw new Error("MEDIA_COMPOSITION_OUTPUT_INVALID");
      }
    }
    generatedKey = momentComposeAttemptOutputKey(mediaAssetId, attempt);
    if (!(await stageMomentCompositionOutput(
      composition.story_id,
      mediaAssetId,
      jobId,
      attempt,
      generatedKey,
      outputBuffer,
    ))) {
      throw new Error("MEDIA_ASSET_DELETED");
    }
    const completed = await completeMomentCompositionAttempt(
      composition.story_id,
      mediaAssetId,
      jobId,
      attempt,
      generatedKey,
      outputProbe.durationMs,
      outputBuffer.length,
    );
    if (!completed) {
      await deleteMomentAttemptOutput(mediaAssetId, generatedKey);
      generatedKey = undefined;
      return;
    }
    // The attempt-specific object is now the live variant and must remain stored.
    generatedKey = undefined;
    logger.info({ mediaAssetId }, "moment-composition: composition completed");
  } catch (error) {
    if (generatedKey) {
      const reconciliation = await reconcileMomentCompositionPromotion(
        generatedKey,
        attempt,
        () => compositionStoryId === undefined
          ? Promise.resolve(null)
          : readMomentCompositionPromotionState(compositionStoryId, mediaAssetId, jobId),
        (key) => deleteMomentAttemptOutput(mediaAssetId, key),
      );
      if (reconciliation === "promoted") {
        generatedKey = undefined;
        logger.info({ mediaAssetId, attempt }, "moment-composition: promotion acknowledgment recovered");
        return;
      }
      if (reconciliation === "unknown") {
        // Do not remove an output that may already be the committed live variant.
        // Its durable cleanup ledger entry lets tombstone/retention cleanup retry.
        logger.error({ mediaAssetId, attempt }, "moment-composition: promotion state ambiguous; retaining attempt output");
      }
      generatedKey = undefined;
    }
    const requestId = randomUUID();
    const message = error instanceof Error && /^MEDIA_[A-Z_]+$/.test(error.message)
      ? error.message
      : "MEDIA_COMPOSITION_FAILED";
    await failMomentCompositionAttempt(
      compositionStoryId,
      mediaAssetId,
      jobId,
      attempt,
      `${message};request_id=${requestId}`,
    );
    logger.error({ requestId, mediaAssetId, failureCode: message }, "moment-composition: job failed");
    throw new Error(`${message}; request_id=${requestId}`);
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

async function claimMomentCompositionJob(mediaAssetId: number) {
  const [composition] = await db.select({
    story_id: communityStoryMomentCompositionsTable.story_id,
  }).from(communityStoryMomentCompositionsTable)
    .where(eq(communityStoryMomentCompositionsTable.derived_media_asset_id, mediaAssetId))
    .limit(1);
  if (!composition) return undefined;
  return db.transaction(async (tx) => {
    const [story] = await tx.select({
      status: communityStoriesTable.status,
      expires_at: communityStoriesTable.expires_at,
    }).from(communityStoriesTable)
      .where(eq(communityStoriesTable.id, composition.story_id))
      .limit(1)
      .for("share");
    if (!story || story.status !== "published" || story.expires_at <= new Date()) return undefined;
    const [asset] = await tx.select({ status: mediaAssetsTable.status })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1)
      .for("update");
    if (!asset || asset.status === "deleted") return undefined;
    const [claimed] = await tx.update(mediaProcessingJobsTable)
      .set({
        status: "processing",
        attempts: sql`${mediaProcessingJobsTable.attempts} + 1`,
        started_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(
        eq(mediaProcessingJobsTable.media_asset_id, mediaAssetId),
        eq(mediaProcessingJobsTable.job_type, "moment_compose"),
        inArray(mediaProcessingJobsTable.status, ["queued", "failed"]),
      ))
      .returning();
    return claimed;
  });
}

async function processMediaJob(job: Job<MediaJobData>): Promise<void> {
  const { mediaAssetId, jobType } = job.data;
  assertSupportedMediaJob(jobType);
  if (jobType === "moment_compose" && !isMediaPlatformV21Enabled()) return;

  const [claimed] = jobType === "moment_compose"
    ? [await claimMomentCompositionJob(mediaAssetId)].filter(Boolean)
    : await db.update(mediaProcessingJobsTable)
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
    await cancelClaimedJob(claimed.id, jobType === "moment_compose" ? claimed.attempts : undefined);
    return;
  }
  if (jobType === "moment_compose") {
    await processMomentComposition(mediaAssetId, claimed.id, claimed.attempts);
    return;
  }
  const preservesReadyVideo = (jobType === "thumbnail" || jobType === "audio_mix")
    && asset.media_type === "video" && asset.status === "ready";
  const requestedCoverTimeMs = jobType === "thumbnail" && asset.media_type === "video"
    ? Number.isFinite(asset.composition_manifest?.cover_time_ms)
      ? Math.max(0, asset.composition_manifest!.cover_time_ms!)
      : null
    : undefined;
  let tempDir: string | undefined;
  const generatedKeys: string[] = [];
  let failureStage: MediaProcessingFailureStage = "source_size_check";
  try {
    failureStage = "source_size_check";
    if (!isAllowedMediaSize(asset.byte_size)) throw new Error("MEDIA_SIZE_INVALID");
    failureStage = "source_object_info";
    const originalInfo = await getAssetInfo(asset.original_key);
    if (!originalInfo || !isAllowedMediaSize(originalInfo.contentLength) || originalInfo.contentLength !== asset.byte_size) {
      throw new Error("MEDIA_SIZE_INVALID");
    }
    failureStage = "source_object_read";
    const original = await getAssetBuffer(asset.original_key, MAX_MEDIA_BYTES);
    if (original.length !== asset.byte_size || !isAllowedMediaSize(original.length)) {
      throw new Error("MEDIA_SIZE_INVALID");
    }
    failureStage = "source_validation";
    const metadata = await validateMediaBuffer(original, asset.media_type, asset.mime_type);
    failureStage = "source_metadata_update";
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
      failureStage = "probe_metadata_update";
      await db.update(mediaAssetsTable).set({
        width: metadata.width,
        height: metadata.height,
        duration_ms: metadata.duration_ms,
        metadata: { ...asset.metadata, probed: true },
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, mediaAssetId), ne(mediaAssetsTable.status, "deleted")));
    } else {
      failureStage = "scratch_directory_create";
      tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-media-"));
      const input = path.join(tempDir, "original");
      failureStage = "source_scratch_write";
      await writeFile(input, original);

      if (jobType === "thumbnail") {
        const output = path.join(tempDir, "thumbnail.jpg");
        const coverTimeMs = requestedCoverTimeMs ?? null;
        const jobSuffix = String(job.id ?? randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(-48);
        failureStage = "thumbnail_ffmpeg";
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
        failureStage = "thumbnail_output_read";
        const outputBuffer = await readBoundedOutput(output);
        failureStage = "thumbnail_output_validation";
        await validateMediaBuffer(outputBuffer, "photo", "image/jpeg");
        generatedKeys.push(key);
        failureStage = "thumbnail_store";
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
        failureStage = "transcode_precondition";
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
        failureStage = "transcode_ffmpeg";
        await runFfmpeg([
          "-y", "-i", input, "-c:v", "libx264", "-preset", "veryfast",
          "-crf", "23", "-pix_fmt", "yuv420p",
          ...(filter ? ["-vf", filter] : []),
          "-c:a", "aac",
          "-movflags", "+faststart", output,
        ]);
        const key = `media-assets/${asset.id}/variant.mp4`;
        failureStage = "transcode_output_read";
        const outputBuffer = await readBoundedOutput(output);
        failureStage = "transcode_output_validation";
        await validateMediaBuffer(outputBuffer, "video", "video/mp4");
        generatedKeys.push(key);
        failureStage = "transcode_store";
        if ((await storeGeneratedAsset(mediaAssetId, "variant_key", key, outputBuffer, "video/mp4")) !== "stored") {
          throw new Error("MEDIA_ASSET_DELETED");
        }
      } else if (jobType === "audio_mix") {
        failureStage = "audio_mix_precondition";
        if (!asset.mime_type.startsWith("video/")) throw new Error("audio_mix is only valid for video assets");
        const music = asset.composition_manifest?.music;
        const trackAssetId = music?.track_asset_id;
        if (!Number.isSafeInteger(trackAssetId) || !trackAssetId || trackAssetId < 1) {
          throw new Error("MEDIA_MUSIC_TRACK_INVALID");
        }
        failureStage = "audio_track_lookup";
        const [musicAsset] = await db.select({
          owner_user_id: mediaAssetsTable.owner_user_id,
          context_kind: mediaAssetsTable.context_kind,
          context_id: mediaAssetsTable.context_id,
          media_type: mediaAssetsTable.media_type,
          mime_type: mediaAssetsTable.mime_type,
          original_key: mediaAssetsTable.original_key,
          byte_size: mediaAssetsTable.byte_size,
          status: mediaAssetsTable.status,
          metadata: mediaAssetsTable.metadata,
        }).from(mediaAssetsTable)
          .where(eq(mediaAssetsTable.id, trackAssetId))
          .limit(1);
        if (!musicAsset || musicAsset.owner_user_id !== asset.owner_user_id
          || musicAsset.context_kind !== asset.context_kind || musicAsset.context_id !== asset.context_id
          || musicAsset.media_type !== "audio" || !musicAsset.mime_type.startsWith("audio/")
          || musicAsset.status !== "ready" || !isMomentMusicAsset(musicAsset.metadata, asset.owner_user_id)) {
          throw new Error("MEDIA_MUSIC_RIGHTS_INVALID");
        }
        failureStage = "audio_track_info";
        const musicInfo = await getAssetInfo(musicAsset.original_key);
        if (!musicInfo || !isAllowedMediaSize(musicInfo.contentLength)
          || musicInfo.contentLength !== musicAsset.byte_size) throw new Error("MEDIA_SIZE_INVALID");
        failureStage = "audio_track_read";
        const musicBuffer = await getAssetBuffer(musicAsset.original_key, MAX_MEDIA_BYTES);
        if (musicBuffer.length === 0 || musicBuffer.length !== musicInfo.contentLength || musicBuffer.length > MAX_MEDIA_BYTES) {
          throw new Error("audio track is empty or exceeds the processing limit");
        }
        failureStage = "audio_track_validation";
        await validateMediaBuffer(musicBuffer, "audio", musicAsset.mime_type);
        const musicInput = path.join(tempDir, "music");
        const output = path.join(tempDir, "variant-mixed.mp4");
        failureStage = "audio_track_scratch_write";
        await writeFile(musicInput, musicBuffer);
        const volume = Math.min(Math.max(Number(music.volume ?? 1), 0), 2);
        let hasOriginalAudio = false;
        try {
          failureStage = "audio_original_probe";
          const probe = await execFileAsync(mediaToolPaths.ffprobe, [
            "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=index", "-of", "csv=p=0", input,
          ], { timeout: 10_000 });
          hasOriginalAudio = Boolean(probe.stdout.trim());
        } catch {
          hasOriginalAudio = false;
        }
        failureStage = "audio_mix_ffmpeg";
        const mixArgs = hasOriginalAudio
          ? [
            "-filter_complex", `[0:a]volume=1[original];[1:a]volume=${volume}[music];[original][music]amix=inputs=2:duration=longest:dropout_transition=2[a]`,
            "-map", "0:v:0", "-map", "[a]",
          ]
          : ["-map", "0:v:0", "-map", "1:a:0"];
        await runFfmpeg([
          "-y", "-i", input, "-stream_loop", "-1", "-i", musicInput,
          ...mixArgs, "-c:v", "copy", "-c:a", "aac", "-shortest",
          "-movflags", "+faststart", output,
        ]);
        const key = `media-assets/${asset.id}/variant-mixed.mp4`;
        failureStage = "audio_mix_output_read";
        const outputBuffer = await readBoundedOutput(output);
        failureStage = "audio_mix_output_validation";
        await validateMediaBuffer(outputBuffer, "video", "video/mp4");
        generatedKeys.push(key);
        failureStage = "audio_mix_store";
        if ((await storeGeneratedAsset(mediaAssetId, "variant_key", key, outputBuffer, "video/mp4")) !== "stored") {
          throw new Error("MEDIA_ASSET_DELETED");
        }
      }
    }

    failureStage = "completion_asset_read";
    const [currentAsset] = await db.select({ status: mediaAssetsTable.status })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, mediaAssetId))
      .limit(1);
    if (!currentAsset || currentAsset.status === "deleted") {
      await cancelClaimedJob(claimed.id);
      return;
    }

    failureStage = "completion_commit";
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
    logger.error({
      requestId,
      mediaAssetId,
      jobType,
      failureCode: message,
      failureStage,
      ...mediaProcessingErrorDetails(error),
    }, "media-processing: job failed");
    throw new Error(`${message}; request_id=${requestId}`);
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

export async function startMediaProcessWorker(): Promise<Worker<MediaJobData> | null> {
  const connection = getRedisConnection();
  if (!connection) return null;
  const worker = new Worker<MediaJobData>(QUEUE.MEDIA_PROCESSING, processMediaJob, {
    connection,
    concurrency: 1,
  });
  const tracked = trackWorker(worker);
  if (!tracked) return null;
  const blockingConnection = (tracked as unknown as {
    blockingConnection?: MediaWorkerBlockingConnection;
  }).blockingConnection;
  if (!blockingConnection || typeof blockingConnection.on !== "function") {
    await tracked.close(true).catch(() => undefined);
    throw new Error("BullMQ worker blocking connection lifecycle is unavailable");
  }
  worker.on("failed", (job, error) => {
    logger.error({ mediaAssetId: job?.data.mediaAssetId, jobType: job?.data.jobType, failureCode: error.message.split(";")[0] }, "media-processing: BullMQ job failed");
  });
  await monitorMediaWorker(
    tracked as unknown as Worker<MediaJobData> & MediaWorkerStartup & MediaWorkerLifecycleEmitter,
    blockingConnection,
    {
      ready: () => workerStarted("media-processing", "Universal Media Processing", true),
      failed: (error) => {
        workerFailed("media-processing", "Universal Media Processing", error);
        logger.error({ err: error }, "media-processing: BullMQ worker is not ready");
      },
      stopped: () => workerStopped("media-processing", "Universal Media Processing"),
    },
  );
  return tracked;
}