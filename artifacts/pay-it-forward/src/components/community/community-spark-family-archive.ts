import { authHeaders } from "@/lib/auth";
import { storiesClient } from "../family/stories-client";

export const FAMILY_STORY_CANDIDATE_DURATION_MS = 60_000;
export const FAMILY_STORY_MAX_FILE_BYTES = 20 * 1024 * 1024;

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

async function ensurePrivateMemory(familyId: number, momentId: number, signal?: AbortSignal): Promise<number> {
  const title = `Saved Spark from Moment ${momentId}`;
  const existing = await storiesClient.memories(familyId, title);
  const matchingMemory = existing.memories.find((memory) => memory.title === title);
  if (matchingMemory) return matchingMemory.id;
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const result = await postJson<{ memory?: { id?: number } }>(`/api/family/${familyId}/memories`, {
    title,
    description: "A private Family Vault copy of the selected Spark media.",
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
  momentId: number,
  caption: string,
  signal?: AbortSignal,
): Promise<void> {
  const body = caption.trim() || `Private media copy of Community Moment ${momentId}.`;
  const title = caption.trim().slice(0, 200) || `Saved Spark ${momentId}`;
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
  momentId: number,
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
    clientUploadId: `spark-${momentId}-${index}`,
  }, signal);
}

export async function saveSparkAsPrivateFamilyStory({
  familyId,
  momentId,
  caption,
  files,
  onProgress,
  signal,
}: {
  familyId: number;
  momentId: number;
  caption: string;
  files: File[];
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  if (!Number.isSafeInteger(familyId) || familyId < 1 || !Number.isSafeInteger(momentId) || momentId < 1) {
    throw new Error("Choose a Family Space and publish this Spark before saving its private copy.");
  }
  if (!canCopyStudioFilesToFamily(files)) {
    throw new Error("Every selected item must be a supported photo or video no larger than 20 MB.");
  }

  onProgress?.("Preparing a private Family Story…");
  const memoryId = await ensurePrivateMemory(familyId, momentId, signal);
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  await ensurePrivateStory(familyId, memoryId, momentId, caption, signal);

  for (let index = 0; index < files.length; index++) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    onProgress?.(`Saving Family Story media ${index + 1} of ${files.length}…`);
    await uploadPrivateAsset(familyId, memoryId, momentId, files[index], index, signal);
  }
}