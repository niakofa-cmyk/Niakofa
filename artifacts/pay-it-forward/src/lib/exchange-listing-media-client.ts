import { authHeaders } from "@/lib/auth";
import { ensureSameOriginMediaPath, uploadBinaryMedia } from "./media-upload-client";

export const EXCHANGE_LISTING_MEDIA_MAX_FILES = 6;
export const EXCHANGE_LISTING_MEDIA_MAX_BYTES = 64 * 1024 * 1024;
export const EXCHANGE_LISTING_VIDEO_MAX_SECONDS = 180;

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

type ApiError = { error?: string; error_code?: string };

export class ExchangeListingMediaError extends Error {
  readonly errorCode?: string;
  readonly status?: number;

  constructor(message: string, options: { errorCode?: string; status?: number } = {}) {
    super(message);
    this.name = "ExchangeListingMediaError";
    this.errorCode = options.errorCode;
    this.status = options.status;
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...authHeaders(),
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) {
    const errorPayload = payload && typeof payload === "object" ? payload as ApiError : {};
    throw new ExchangeListingMediaError(errorPayload.error || "The media upload could not be completed.", {
      errorCode: errorPayload.error_code,
      status: response.status,
    });
  }
  return payload as T;
}

function normalizedMimeType(file: File): string {
  return file.type.split(";", 1)[0].trim().toLowerCase();
}

export function validateExchangeListingMediaFile(file: File): string | null {
  const mimeType = normalizedMimeType(file);
  if (!PHOTO_TYPES.has(mimeType) && !VIDEO_TYPES.has(mimeType)) {
    return `${file.name}: choose a JPEG, PNG, GIF, or WebP photo, or an MP4 or WebM video.`;
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > EXCHANGE_LISTING_MEDIA_MAX_BYTES) {
    return `${file.name}: each upload must be between 1 byte and 64 MiB.`;
  }
  return null;
}

export function readExchangeListingVideoDuration(file: File, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Video check cancelled.", "AbortError"));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const timeout = window.setTimeout(() => finish(() => reject(
      new ExchangeListingMediaError("Video details could not be read. Choose another MP4 or WebM clip."),
    )), 10_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", failed);
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // Some browser decoders reject load() after source removal.
      }
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const abort = () => finish(() => reject(new DOMException("Video check cancelled.", "AbortError")));
    const loaded = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(() => reject(new ExchangeListingMediaError("The video duration could not be read. Choose another MP4 or WebM clip.")));
      } else if (duration > EXCHANGE_LISTING_VIDEO_MAX_SECONDS) {
        finish(() => reject(new ExchangeListingMediaError("Exchange videos must be 180 seconds or shorter.")));
      } else {
        finish(() => resolve(duration));
      }
    };
    const failed = () => finish(() => reject(new ExchangeListingMediaError("The video duration could not be read. Choose another MP4 or WebM clip.")));
    video.preload = "metadata";
    video.muted = true;
    video.addEventListener("loadedmetadata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    video.src = objectUrl;
  });
}

export async function deleteExchangeListingDraftMedia(mediaAssetId: number): Promise<void> {
  if (!Number.isSafeInteger(mediaAssetId) || mediaAssetId <= 0) return;
  await fetch(`/api/media-assets/${mediaAssetId}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: authHeaders(),
  });
}

export async function uploadExchangeListingMediaFile(input: {
  ownerId: number;
  file: File;
  signal: AbortSignal;
  onProgress?: (progress: number) => void;
}): Promise<number> {
  const { ownerId, file, signal, onProgress } = input;
  const validationError = validateExchangeListingMediaFile(file);
  if (validationError) throw new ExchangeListingMediaError(validationError);
  const mimeType = normalizedMimeType(file);
  if (VIDEO_TYPES.has(mimeType)) await readExchangeListingVideoDuration(file, signal);

  const session = await apiRequest<{
    media_asset_id: number;
    upload: { method: string; url: string; headers: Record<string, string> };
    complete_url: string;
  }>("/api/media-assets/uploads", {
    method: "POST",
    body: JSON.stringify({
      contextKind: "exchange_listing_draft",
      contextId: ownerId,
      mediaType: PHOTO_TYPES.has(mimeType) ? "photo" : "video",
      mimeType,
      byteSize: file.size,
      originalName: file.name,
    }),
    signal,
  });

  try {
    await uploadBinaryMedia({
      upload: session.upload,
      file,
      signal,
      onProgress: (loaded, total) => onProgress?.(Math.round((loaded / Math.max(total, 1)) * 90)),
      errors: {
        method: "The media service did not provide a PUT upload.",
        invalidUrl: "The media service returned an invalid upload URL.",
        failed: "The media bytes could not be uploaded. Check your connection and retry.",
        network: "Storage upload failed. Check your connection and retry.",
        timeout: "Storage upload timed out. You can retry.",
      },
      makeError: (message, status) => new ExchangeListingMediaError(message, { status }),
    });
    const completed = await apiRequest<{ media_asset_id: number }>(
      ensureSameOriginMediaPath(session.complete_url, (message) => new ExchangeListingMediaError(message)),
      { method: "POST", body: JSON.stringify({}), signal },
    );
    onProgress?.(100);
    return completed.media_asset_id;
  } catch (error) {
    await deleteExchangeListingDraftMedia(session.media_asset_id).catch(() => undefined);
    throw error;
  }
}
