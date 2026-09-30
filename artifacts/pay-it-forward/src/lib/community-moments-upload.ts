import { authHeaders, getToken } from "@/lib/auth";
import { ensureSameOriginMediaPath, uploadBinaryMedia, uploadResumableMedia } from "./media-upload-client";

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
  resumableUploads?: Record<string, { mediaAssetId: number; offset: number; complete?: boolean }>;
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
  if (!response.ok) {
    const error = new Error(payload.error || `Media request failed (HTTP ${response.status}).`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

type UploadSession = {
  media_asset_id: number;
  upload: { method: "PUT"; url: string; headers: Record<string, string> };
  resumable?: {
    chunk_size: number;
    status_url: string;
    chunk_url: string;
  };
  complete_url: string;
};

type ResumableStatus = {
  media_asset_id: number;
  offset: number;
  total_bytes: number;
  chunk_size: number;
  finalized: boolean;
  status: string;
};

async function communityFileDigest(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure upload recovery is unavailable in this browser.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function authenticatedMediaDraftUserId(token: string | null = getToken()): number | null {
  const parsed = Number(token?.split(".")[0]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

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
  const digest = await communityFileDigest(input.file);
  const authenticatedUserId = authenticatedMediaDraftUserId();
  // The server still authenticates every request; this identity is only used
  // to prevent local recovery records from crossing account boundaries.
  const userId = authenticatedUserId ?? input.contextId;
  const resumeKey = `${input.contextKind}:${input.contextId}:${digest}`;
  const draftId = `media-upload:${resumeKey}`;
  let savedDraft: CommunityMomentDraft | null = null;
  let draftStoreAvailable = true;
  if (authenticatedUserId !== null) {
    try {
      savedDraft = await getCommunityMomentDraft(draftId, authenticatedUserId);
    } catch {
      draftStoreAvailable = false;
    }
  }
  let savedSessionId = savedDraft?.resumableUploads?.[digest]?.mediaAssetId;
  let session: UploadSession | null = null;
  let status: ResumableStatus | null = null;

  if (savedSessionId && Number.isSafeInteger(savedSessionId) && savedSessionId > 0) {
    try {
      status = await requestJson<ResumableStatus>(
        `/api/media-assets/${savedSessionId}/upload-session`,
        { signal: input.signal },
      );
      if (status.total_bytes !== input.file.size || status.media_asset_id !== savedSessionId) {
        throw new Error("The saved upload does not match this file.");
      }
      session = {
        media_asset_id: savedSessionId,
        upload: {
          method: "PUT",
          url: `/api/media-assets/${savedSessionId}/upload`,
          headers: { "Content-Type": input.file.type },
        },
        resumable: {
          chunk_size: status.chunk_size,
          status_url: `/api/media-assets/${savedSessionId}/upload-session`,
          chunk_url: `/api/media-assets/${savedSessionId}/upload/chunks`,
        },
        complete_url: `/api/media-assets/${savedSessionId}/complete`,
      };
    } catch (error) {
      if ((error as Error & { status?: number }).status !== 404) throw error;
      savedSessionId = undefined;
      status = null;
    }
  }
  if (!session) {
    session = await requestJson<UploadSession>("/api/media-assets/uploads", {
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
  }
  if (!Number.isSafeInteger(session.media_asset_id) || session.media_asset_id <= 0) {
    throw new Error("The media service returned an invalid upload session.");
  }
  const persistSession = async (offset: number, complete = false) => {
    const resumableUploads = {
      ...(savedDraft?.resumableUploads ?? {}),
      [digest]: { mediaAssetId: session!.media_asset_id, offset, ...(complete ? { complete: true } : {}) },
    };
    const record: CommunityMomentDraft = {
      id: draftId,
      userId,
      contextKind: input.contextKind,
      contextId: input.contextId,
      caption: "",
      files: [input.file],
      resumableUploads,
      updatedAt: Date.now(),
    };
    await saveCommunityMomentDraft(record);
    savedDraft = record;
  };
  if (session.resumable) {
    if (authenticatedUserId === null) {
      throw new Error("Sign in again to save a resumable media upload to your account.");
    }
    if (!draftStoreAvailable) {
      throw new Error("Upload recovery storage is unavailable. Nothing was uploaded; enable browser storage and retry.");
    }
    if (session.resumable.chunk_size < 1 || session.resumable.chunk_size > 4 * 1024 * 1024) {
      throw new Error("The media service returned an invalid chunk size.");
    }
    if (!status) {
      status = await requestJson<ResumableStatus>(
        ensureSameOriginMediaPath(session.resumable.status_url),
        { signal: input.signal },
      );
    }
    if (status.total_bytes !== input.file.size || status.media_asset_id !== session.media_asset_id) {
      throw new Error("The resumable upload does not match the selected file.");
    }
    await persistSession(status.offset);
    if (status.status === "pending" || status.status === "failed") {
      await uploadResumableMedia({
        upload: {
          method: "PUT",
          url: ensureSameOriginMediaPath(session.resumable.chunk_url),
          chunkSize: session.resumable.chunk_size,
        },
        file: input.file,
        initialOffset: status.offset,
        signal: input.signal,
        onProgress: (loaded, total) => input.onProgress?.(total > 0 ? Math.min(99, Math.round(loaded / total * 100)) : 0),
        onConfirmedOffset: (offset) => persistSession(offset),
      });
    } else if (status.offset !== input.file.size && !status.finalized) {
      throw new Error("The server reports an incomplete upload in a non-retryable state.");
    }
  } else {
    // Compatibility with older V21 servers; new server responses always
    // advertise resumable chunks while retaining their original whole-file PUT.
    await uploadBinaryMedia({
      upload: session.upload,
      file: input.file,
      signal: input.signal,
      onProgress: (loaded, total) => input.onProgress?.(total > 0 ? Math.min(99, Math.round(loaded / total * 100)) : 0),
    });
  }
  const completion = await requestJson<{ media_asset_id: number; status: string }>(ensureSameOriginMediaPath(session.complete_url), {
    method: "POST",
    body: JSON.stringify({}),
    signal: input.signal,
  });
  if (completion.media_asset_id !== session.media_asset_id
    || !["processing", "ready", "uploaded"].includes(completion.status)) {
    throw new Error("The media service did not confirm upload completion.");
  }
  if (session.resumable) await persistSession(input.file.size, true);
  input.onProgress?.(100);
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