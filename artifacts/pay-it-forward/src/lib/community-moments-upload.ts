import { authHeaders } from "@/lib/auth";
import { ensureSameOriginMediaPath, uploadBinaryMedia } from "./media-upload-client";

export const COMMUNITY_MOMENTS_MAX_BYTES = 64 * 1024 * 1024;
export const COMMUNITY_MOMENTS_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);

export type CommunityMomentContext = "story" | "hub" | "community_moment" | "hub_moment";

export type CommunityMomentDraft = {
  id: string;
  userId: number;
  contextKind: CommunityMomentContext;
  contextId: number;
  caption: string;
  files: File[];
  uploadedMediaAssetIds?: number[];
  updatedAt: number;
};

export function validateCommunityMomentFile(file: Pick<File, "type" | "size">): string | null {
  if (!COMMUNITY_MOMENTS_ALLOWED_TYPES.has(file.type)) {
    return "Choose a JPEG, PNG, WebP, GIF, MP4, WebM, MP3, OGG, or WAV file.";
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > COMMUNITY_MOMENTS_MAX_BYTES) {
    return "Media must be between 1 byte and 64 MiB.";
  }
  return null;
}

function validateContextId(contextId: number): void {
  if (!Number.isSafeInteger(contextId) || contextId <= 0) throw new Error("Invalid media context.");
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...authHeaders(),
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Media request failed (HTTP ${response.status}).`);
  return payload as T;
}

type UploadSession = {
  media_asset_id: number;
  upload: { method: "PUT"; url: string; headers: Record<string, string> };
  complete_url: string;
};

export async function uploadCommunityMomentMedia(input: {
  contextKind: CommunityMomentContext;
  contextId: number;
  file: File;
  signal: AbortSignal;
  onProgress?: (percent: number) => void;
  musicRights?: {
    confirmed: true;
    basis: "original" | "licensed";
    licenseReference?: string;
  };
}): Promise<number> {
  validateContextId(input.contextId);
  const fileError = validateCommunityMomentFile(input.file);
  if (fileError) throw new Error(fileError);

  const mediaType = input.file.type.startsWith("image/")
    ? "photo"
    : input.file.type.startsWith("video/")
      ? "video"
      : "audio";
  const session = await requestJson<UploadSession>("/api/media-assets/uploads", {
    method: "POST",
    body: JSON.stringify({
      contextKind: input.contextKind,
      contextId: input.contextId,
      mediaType,
      mimeType: input.file.type,
      byteSize: input.file.size,
      originalName: input.file.name,
      ...(input.musicRights ? { musicRights: input.musicRights } : {}),
    }),
    signal: input.signal,
  });
  if (!Number.isSafeInteger(session.media_asset_id) || session.media_asset_id <= 0) {
    throw new Error("The media service returned an invalid upload session.");
  }
  await uploadBinaryMedia({
    upload: session.upload,
    file: input.file,
    signal: input.signal,
    onProgress: (loaded, total) => input.onProgress?.(total > 0 ? Math.round(loaded / total * 100) : 0),
  });
  await requestJson<{ media_asset_id: number; status: string }>(ensureSameOriginMediaPath(session.complete_url), {
    method: "POST",
    body: JSON.stringify({}),
    signal: input.signal,
  });
  return session.media_asset_id;
}

const DRAFT_DB = "niakofa-community-moments-drafts";
const DRAFT_STORE = "drafts";

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Draft recovery is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE)) {
        request.result.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(new Error("Community draft storage could not be opened."));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveCommunityMomentDraft(draft: CommunityMomentDraft): Promise<void> {
  validateContextId(draft.contextId);
  if (!Number.isSafeInteger(draft.userId) || draft.userId <= 0) throw new Error("Sign in to save a community draft.");
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).put(draft);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("Community draft could not be saved."));
    transaction.onabort = () => reject(new Error("Community draft could not be saved."));
  }).finally(() => db.close());
}

export async function getCommunityMomentDraft(
  id: string,
  userId: number,
): Promise<CommunityMomentDraft | null> {
  const db = await openDraftDb();
  const result = await new Promise<CommunityMomentDraft | null>((resolve, reject) => {
    const request = db.transaction(DRAFT_STORE, "readonly").objectStore(DRAFT_STORE).get(id);
    request.onsuccess = () => {
      const draft = request.result as CommunityMomentDraft | undefined;
      resolve(draft?.userId === userId ? draft : null);
    };
    request.onerror = () => reject(new Error("Community draft could not be recovered."));
  }).finally(() => db.close());
  return result;
}

export async function deleteCommunityMomentDraft(id: string, userId: number): Promise<void> {
  const draft = await getCommunityMomentDraft(id, userId);
  if (!draft) return;
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("Community draft could not be removed."));
    transaction.onabort = () => reject(new Error("Community draft could not be removed."));
  }).finally(() => db.close());
}