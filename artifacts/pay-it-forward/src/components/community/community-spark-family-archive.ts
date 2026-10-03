import { authHeaders } from "@/lib/auth";
import { storiesClient } from "../family/stories-client";

export const FAMILY_STORY_CANDIDATE_DURATION_MS = 60_000;
export const FAMILY_STORY_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MOMENT_VIDEO_CUTDOWN_MAX_DURATION_MS = 60_000;

const FAMILY_STORY_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

export function totalStudioVideoDurationMs(files: File[], durationsMs: Array<number | null>): number {
  return files.reduce((total, file, index) => (
    file.type.startsWith("video/") ? total + (durationsMs[index] ?? 0) : total
  ), 0);
}

/**
 * Keep photos and the earliest complete video clips that fit the Moment limit.
 * The final clip is not re-encoded or shortened, so the original files remain
 * stable for retries and can be archived separately without losing quality.
 */
export function chooseMomentCutdownIndexes(
  files: File[],
  durationsMs: Array<number | null>,
  maxDurationMs = MOMENT_VIDEO_CUTDOWN_MAX_DURATION_MS,
): number[] {
  const indexes: number[] = [];
  let videoDurationMs = 0;
  let videoLimitReached = false;

  files.forEach((file, index) => {
    if (!file.type.startsWith("video/")) {
      indexes.push(index);
      return;
    }
    if (videoLimitReached) return;

    const durationMs = durationsMs[index];
    if (!Number.isFinite(durationMs) || !durationMs || durationMs < 0) {
      throw new Error(`${file.name}: Could not verify this clip’s duration for the 60-second Moment limit.`);
    }
    if (videoDurationMs + durationMs > maxDurationMs) {
      videoLimitReached = true;
      return;
    }
    indexes.push(index);
    videoDurationMs += durationMs;
  });

  if (!indexes.some((index) => files[index].type.startsWith("video/"))) {
    throw new Error("No complete video clip fits within 60 seconds. Trim it in Studio or save the full recording as a private Family Story.");
  }
  return indexes;
}

export function canCopyStudioFilesToFamily(files: File[]): boolean {
  return files.length > 0 && files.every((file) => (
    FAMILY_STORY_MEDIA_TYPES.has(file.type)
    && file.size > 0
    && file.size <= FAMILY_STORY_MAX_FILE_BYTES
  ));
}

async function readJsonError(response: Response): Promise<string> {
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (result?.error) return result.error;
  if (response.status === 401) return "Your session has expired. Sign in again to save this Family Story.";
  return `Family Story request failed (${response.status}).`;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(await readJsonError(response));
  return response.json() as Promise<T>;
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name}: Could not read this file for Family Vault.`));
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith(`data:${file.type};base64,`)) {
        reject(new Error(`${file.name}: Could not prepare this file for Family Vault.`));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function ensurePrivateMemory(familyId: number, archiveId: string, signal?: AbortSignal): Promise<number> {
  const title = `Spark Family Story ${archiveId}`;
  const existing = await storiesClient.memories(familyId, title);
  const matchingMemory = existing.memories.find((memory) => memory.title === title);
  if (matchingMemory) return matchingMemory.id;
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const result = await postJson<{ memory?: { id?: number } }>(`/api/family/${familyId}/memories`, {
    title,
    description: "Private original media saved from Spark Studio.",
    source: "upload",
    visibility: "private",
    tags: ["community", "spark"],
  }, signal);
  const memoryId = result.memory?.id;
  if (typeof memoryId !== "number" || !Number.isSafeInteger(memoryId) || memoryId < 1) {
    throw new Error("Family Vault did not confirm the private memory. Keep this Spark draft and retry.");
  }
  return memoryId;
}

async function ensurePrivateStory(
  familyId: number,
  memoryId: number,
  caption: string,
  signal?: AbortSignal,
): Promise<void> {
  const body = caption.trim() || "Original media preserved privately from Spark Studio.";
  const title = caption.trim().slice(0, 200) || "Private Spark Family Story";
  await postJson<{ story?: { id?: number } }>(`/api/family/${familyId}/stories/spark-copy`, {
    title,
    body,
    audience: "private",
    category: "written",
    memory_id: memoryId,
    tags: ["community", "spark"],
  }, signal);
}

async function uploadPrivateAsset(
  familyId: number,
  memoryId: number,
  archiveId: string,
  file: File,
  index: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!FAMILY_STORY_MEDIA_TYPES.has(file.type)) {
    throw new Error(`${file.name}: Family Vault supports JPG, PNG, WebP, GIF, MP4, and WebM files.`);
  }
  if (file.size <= 0 || file.size > FAMILY_STORY_MAX_FILE_BYTES) {
    throw new Error(`${file.name}: Family Vault copies are limited to 20 MB per item.`);
  }

  const dataUrl = await fileAsDataUrl(file);
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  await postJson(`/api/family/${familyId}/memories/${memoryId}/assets/upload-spark`, {
    dataUrl,
    filename: file.name,
    mimeType: file.type,
    assetType: file.type.startsWith("video/") ? "video" : "photo",
    clientUploadId: `spark-${archiveId}-${index}`,
  }, signal);
}

export async function saveSparkAsPrivateFamilyStory({
  familyId,
  archiveId,
  caption,
  files,
  onProgress,
  signal,
}: {
  familyId: number;
  archiveId: string;
  caption: string;
  files: File[];
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  if (!Number.isSafeInteger(familyId) || familyId < 1 || !/^[a-zA-Z0-9_-]{1,64}$/.test(archiveId)) {
    throw new Error("Choose a Family Space before saving this private Family Story.");
  }
  if (!canCopyStudioFilesToFamily(files)) {
    throw new Error("Every selected item must be a supported photo or video no larger than 20 MB.");
  }

  onProgress?.("Preparing a private Family Story…");
  const memoryId = await ensurePrivateMemory(familyId, archiveId, signal);
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  await ensurePrivateStory(familyId, memoryId, caption, signal);

  for (let index = 0; index < files.length; index++) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    onProgress?.(`Saving Family Story media ${index + 1} of ${files.length}…`);
    await uploadPrivateAsset(familyId, memoryId, archiveId, files[index], index, signal);
  }
}