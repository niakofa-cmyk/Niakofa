import { createHash } from "node:crypto";

export const MOMENT_COMPOSE_INTENT = "camera_clip_reel" as const;
export const MOMENT_COMPOSE_MAX_CLIPS = 6;
export const MOMENT_COMPOSE_MAX_DURATION_MS = 180_000;

export function validMomentComposeIds(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= MOMENT_COMPOSE_MAX_CLIPS
    && value.every((id) => Number.isSafeInteger(id) && id > 0)
    && new Set(value).size === value.length;
}

export function momentCompositionFingerprint(sourceIds: number[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ intent: MOMENT_COMPOSE_INTENT, source_media_asset_ids: sourceIds }))
    .digest("hex");
}

export function isPublishedStoryMediaContext(contextKind: string, contextId: number, storyId: number): boolean {
  return contextKind === "story" && contextId === storyId;
}

export function isUnfinishedResumableUpload(finalized: boolean, nextOffset: number): boolean {
  return !finalized && Number.isSafeInteger(nextOffset) && nextOffset >= 0;
}

export function momentCompositionAttemptOwnsJob(
  status: string,
  currentAttempt: number,
  claimedAttempt: number,
): boolean {
  return status === "processing"
    && Number.isSafeInteger(currentAttempt)
    && currentAttempt > 0
    && currentAttempt === claimedAttempt;
}

export type MomentCompositionPromotionState = {
  job_status: string;
  job_attempt: number;
  asset_status: string;
  variant_key: string | null;
  composition_status: string;
};

export function momentCompositionPromotionIsCommitted(
  state: MomentCompositionPromotionState | null,
  key: string,
  attempt: number,
): boolean {
  return state !== null
    && state.job_status === "completed"
    && state.job_attempt === attempt
    && state.asset_status === "ready"
    && state.variant_key === key
    && state.composition_status === "ready";
}

/**
 * Resolve an ambiguous promotion result conservatively. Unknown DB state must
 * retain the cleanup-ledgered object rather than risk deleting a live variant.
 */
export async function reconcileMomentCompositionPromotion(
  key: string,
  attempt: number,
  readState: () => Promise<MomentCompositionPromotionState | null>,
  deleteOutput: (key: string) => Promise<void>,
): Promise<"promoted" | "not_promoted" | "unknown"> {
  let state: MomentCompositionPromotionState | null;
  try {
    state = await readState();
  } catch {
    return "unknown";
  }
  if (momentCompositionPromotionIsCommitted(state, key, attempt)) return "promoted";
  try {
    await deleteOutput(key);
    return "not_promoted";
  } catch {
    return "unknown";
  }
}

/** The ledger callback must commit before writeProviderObject begins. */
export async function withDurableCleanupLedger(
  key: string,
  commitLedger: (key: string) => Promise<boolean>,
  writeProviderObject: () => Promise<boolean>,
): Promise<boolean> {
  if (!(await commitLedger(key))) return false;
  return writeProviderObject();
}

export function momentComposeAttemptOutputKey(mediaAssetId: number, attempt: number): string {
  if (!Number.isSafeInteger(mediaAssetId) || mediaAssetId < 1
    || !Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("MOMENT_COMPOSITION_INVALID");
  }
  return `media-assets/${mediaAssetId}/moment-compose-attempt-${attempt}.mp4`;
}

export function momentClipNormalizeArgs(
  inputPath: string,
  outputPath: string,
  durationMs: number,
  hasAudio: boolean,
): string[] {
  const durationSeconds = (durationMs / 1000).toFixed(3);
  return [
    "-y",
    "-i", inputPath,
    ...(!hasAudio ? ["-f", "lavfi", "-t", durationSeconds, "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"] : []),
    "-map", "0:v:0",
    "-map", hasAudio ? "0:a:0" : "1:a:0",
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p",
    "-af", `apad=whole_dur=${durationSeconds},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`,
    "-t", durationSeconds,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ];
}

export function momentConcatArgs(inputListPath: string, outputPath: string, clipCount: number): string[] {
  if (clipCount < 1 || clipCount > MOMENT_COMPOSE_MAX_CLIPS) throw new Error("MOMENT_COMPOSITION_INVALID");
  return [
    "-y",
    "-f", "concat", "-safe", "0", "-i", inputListPath,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ];
}

export function withinMomentTotalVideoDurationLimit(durationsMs: number[]): boolean {
  return durationsMs.every((duration) => Number.isFinite(duration)
      && duration > 0
      && duration <= MOMENT_COMPOSE_MAX_DURATION_MS)
    && durationsMs.reduce((total, duration) => total + duration, 0) <= MOMENT_COMPOSE_MAX_DURATION_MS;
}

export function withinMomentDurationLimit(durationsMs: number[]): boolean {
  return durationsMs.length >= 1
    && durationsMs.length <= MOMENT_COMPOSE_MAX_CLIPS
    && withinMomentTotalVideoDurationLimit(durationsMs);
}