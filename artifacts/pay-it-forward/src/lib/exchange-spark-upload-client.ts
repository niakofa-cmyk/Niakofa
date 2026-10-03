import { authHeaders } from "@/lib/auth";
import { ensureSameOriginMediaPath, uploadBinaryMedia } from "./media-upload-client";
import {
  EXCHANGE_SPARK_MAX_BYTES,
  EXCHANGE_SPARK_MAX_DURATION_SECONDS,
  EXCHANGE_SPARK_METADATA_TIMEOUT_MS,
  EXCHANGE_SPARK_PROCESSING_INTERVAL_MS,
  EXCHANGE_SPARK_PROCESSING_TIMEOUT_MS,
} from "./exchange-spark-upload-rules";

type ApiError = { error?: string; error_code?: string };

export class ExchangeSparkUploadError extends Error {
  errorCode?: string;
  status?: number;

  constructor(message: string, options: { errorCode?: string; status?: number } = {}) {
    super(message);
    this.name = "ExchangeSparkUploadError";
    this.errorCode = options.errorCode;
    this.status = options.status;
  }
}

export interface SparkDraftResponse {
  spark_id: number;
  upload_context: { contextKind: "exchange_spark"; contextId: number };
}

export interface UploadSessionResponse {
  media_asset_id: number;
  upload: { method: "PUT"; url: string; headers: Record<string, string>; expires_in_seconds: number | null };
  complete_url: string;
}

export interface SparkDraftStatus {
  spark_id: number;
  status: string;
  listing_id: number;
  caption: string | null;
  media_assets: Array<{
    media_asset_id: number;
    media_type: string;
    mime_type: string;
    byte_size: number;
    status: string;
    variant_ready: boolean;
    error_code?: string | null;
  }>;
}

export function listExchangeSparkDrafts(signal: AbortSignal) {
  return apiRequest<{ drafts: SparkDraftStatus[] }>("/api/community/exchange/sparks/drafts", { signal });
}

export function discardExchangeSparkDraft(sparkId: number, signal: AbortSignal) {
  return apiRequest<{ spark_id: number; status: string }>(`/api/community/exchange/sparks/${sparkId}`, {
    method: "DELETE",
    signal,
  });
}

export function updateExchangeSparkDraftCaption(sparkId: number, caption: string, signal: AbortSignal) {
  return apiRequest<{ spark_id: number; caption: string | null }>(`/api/community/exchange/sparks/drafts/${sparkId}`, {
    method: "PATCH",
    body: JSON.stringify({ caption }),
    signal,
  });
}

const SAVED_DRAFT_STORAGE_KEY = "community.exchange-spark.draft.v1";

export function saveExchangeSparkDraftId(sparkId: number): void {
  if (!Number.isSafeInteger(sparkId) || sparkId <= 0) {
    throw new ExchangeSparkUploadError("The server returned an invalid Spark draft id.");
  }
  try {
    window.localStorage.setItem(SAVED_DRAFT_STORAGE_KEY, String(sparkId));
  } catch {
    throw new ExchangeSparkUploadError("Your Spark draft could not be saved on this device. Keep this page open until publishing finishes.");
  }
}

export function loadExchangeSparkDraftId(): number | null {
  try {
    const value = window.localStorage.getItem(SAVED_DRAFT_STORAGE_KEY);
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    const sparkId = Number(value);
    return Number.isSafeInteger(sparkId) ? sparkId : null;
  } catch {
    throw new ExchangeSparkUploadError("Saved Spark drafts could not be read from this device.");
  }
}

export function clearExchangeSparkDraftId(): void {
  try {
    window.localStorage.removeItem(SAVED_DRAFT_STORAGE_KEY);
  } catch {
    throw new ExchangeSparkUploadError("The completed Spark draft reference could not be cleared from this device.");
  }
}

export interface SparkPublishResponse {
  spark_id: number;
  status: "published" | "pending";
  media_asset_id: number;
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
    throw new ExchangeSparkUploadError(
      errorPayload.error || "Exchange Spark upload could not be completed.",
      { errorCode: errorPayload.error_code, status: response.status },
    );
  }
  return payload as T;
}

export function createExchangeSparkDraft(listingId: number, caption: string, signal: AbortSignal) {
  return apiRequest<SparkDraftResponse>(`/api/community/exchange/listings/${listingId}/sparks/drafts`, {
    method: "POST",
    body: JSON.stringify({ caption }),
    signal,
  });
}

export function createSparkUploadSession(input: {
  contextId: number;
  file: File;
  signal: AbortSignal;
}) {
  const { contextId, file, signal } = input;
  return apiRequest<UploadSessionResponse>("/api/media-assets/uploads", {
    method: "POST",
    body: JSON.stringify({
      contextKind: "exchange_spark",
      contextId,
      mediaType: "video",
      mimeType: file.type,
      byteSize: file.size,
      originalName: file.name,
    }),
    signal,
  });
}

export function resumeSparkUploadSession(mediaAssetId: number, file: File): UploadSessionResponse {
  if (!Number.isSafeInteger(mediaAssetId) || mediaAssetId <= 0) {
    throw new ExchangeSparkUploadError("The saved Spark upload session is invalid.");
  }
  return {
    media_asset_id: mediaAssetId,
    upload: {
      method: "PUT",
      url: `/api/media-assets/${mediaAssetId}/upload`,
      headers: { "Content-Type": file.type },
      expires_in_seconds: null,
    },
    complete_url: `/api/media-assets/${mediaAssetId}/complete`,
  };
}

export function putRawSparkFile(
  upload: UploadSessionResponse["upload"],
  file: File,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return uploadBinaryMedia({
    upload,
    file,
    signal,
    onProgress,
    errors: {
      method: "The media service did not provide a PUT upload.",
      invalidUrl: "The media service returned an invalid upload URL.",
      failed: "The video bytes could not be uploaded. Check your connection and retry.",
      network: "The storage upload failed. Check your connection and retry.",
      timeout: "The storage upload timed out. You can retry.",
    },
    makeError: (message, status) => new ExchangeSparkUploadError(message, { status }),
  });
}

export function completeSparkUpload(completeUrl: string, signal: AbortSignal) {
  return apiRequest<{ media_asset_id: number; status: string }>(ensureSameOriginMediaPath(
    completeUrl,
    (message) => new ExchangeSparkUploadError(message),
  ), {
    method: "POST",
    body: JSON.stringify({}),
    signal,
  });
}

export function getExchangeSparkDraftStatus(sparkId: number, signal: AbortSignal) {
  return apiRequest<SparkDraftStatus>(`/api/community/exchange/sparks/drafts/${sparkId}`, { signal });
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Polling cancelled.", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Polling cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function waitForExchangeSparkMediaReady(
  sparkId: number,
  signal: AbortSignal,
  onStatus?: (status: string) => void,
): Promise<void> {
  const deadline = Date.now() + EXCHANGE_SPARK_PROCESSING_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await getExchangeSparkDraftStatus(sparkId, signal);
    if (signal.aborted) throw new DOMException("Polling cancelled.", "AbortError");
    const videoAssets = result.media_assets.filter((asset) => asset.media_type === "video");
    const failed = videoAssets.find((asset) => asset.status === "failed");
    if (failed) {
      throw new ExchangeSparkUploadError(
        failed.error_code ? `Video processing failed (${failed.error_code}).` : "Video processing failed. Choose another video and retry.",
        { errorCode: failed.error_code ?? undefined },
      );
    }
    if (videoAssets.some((asset) => asset.status === "ready" && asset.variant_ready)) return;
    onStatus?.(videoAssets[0]?.status ?? "processing");
    await abortableDelay(EXCHANGE_SPARK_PROCESSING_INTERVAL_MS, signal);
  }
  throw new ExchangeSparkUploadError("Video processing did not finish within two minutes. No Spark was published; try again later.");
}

export function publishExchangeSparkDraft(sparkId: number, caption: string, signal: AbortSignal) {
  return apiRequest<SparkPublishResponse>(`/api/community/exchange/sparks/drafts/${sparkId}/publish`, {
    method: "POST",
    body: JSON.stringify({ caption }),
    signal,
  });
}

export function readExchangeSparkVideoDuration(
  file: File,
  signal: AbortSignal,
  timeoutMs = EXCHANGE_SPARK_METADATA_TIMEOUT_MS,
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Video check cancelled.", "AbortError"));
      return;
    }
    if (file.size < 1 || file.size > EXCHANGE_SPARK_MAX_BYTES) {
      reject(new ExchangeSparkUploadError("Video must be between 1 byte and 64 MiB."));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const metadataTimer = setTimeout(() => {
      finish(() => reject(new ExchangeSparkUploadError(
        "Video details could not be loaded within 10 seconds. Choose another MP4 or WebM video.",
      )));
    }, timeoutMs);
    const cleanup = () => {
      if (metadataTimer !== undefined) clearTimeout(metadataTimer);
      signal.removeEventListener("abort", abort);
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", failed);
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        // Releasing the object URL and settling the check takes precedence.
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => finish(() => reject(new DOMException("Video check cancelled.", "AbortError")));
    const loaded = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0 || duration > EXCHANGE_SPARK_MAX_DURATION_SECONDS) {
        finish(() => reject(new ExchangeSparkUploadError(
          duration > EXCHANGE_SPARK_MAX_DURATION_SECONDS
            ? "Exchange Spark videos must be 180 seconds or shorter."
            : "The video duration could not be read. Choose another MP4 or WebM video.",
        )));
      } else {
        finish(() => resolve(duration));
      }
    };
    const failed = () => finish(() => reject(new ExchangeSparkUploadError("The video duration could not be read. Choose another MP4 or WebM video.")));
    video.preload = "metadata";
    video.muted = true;
    video.addEventListener("loadedmetadata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    video.src = objectUrl;
    if (signal.aborted) abort();
  });
}