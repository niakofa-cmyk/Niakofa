export const EXCHANGE_SPARK_MAX_BYTES = 64 * 1024 * 1024;
export const EXCHANGE_SPARK_MAX_DURATION_SECONDS = 60;
export const EXCHANGE_SPARK_UPLOAD_ATTEMPTS = 3;
export const EXCHANGE_SPARK_METADATA_TIMEOUT_MS = 10_000;
export const EXCHANGE_SPARK_PROCESSING_TIMEOUT_MS = 120_000;
export const EXCHANGE_SPARK_PROCESSING_INTERVAL_MS = 2_000;

export function validateExchangeSparkVideo(input: {
  mimeType: string;
  byteSize: number;
  durationSeconds?: number | null;
}): string | null {
  if (input.mimeType !== "video/mp4" && input.mimeType !== "video/webm") {
    return "Choose an MP4 or WebM video.";
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > EXCHANGE_SPARK_MAX_BYTES) {
    return "Video must be between 1 byte and 64 MiB.";
  }
  if (input.durationSeconds === undefined || input.durationSeconds === null) {
    return "Wait for video details to finish checking.";
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    return "The video duration could not be read. Choose another MP4 or WebM video.";
  }
  if (input.durationSeconds > EXCHANGE_SPARK_MAX_DURATION_SECONDS) {
    return "Exchange Spark videos must be 60 seconds or shorter.";
  }
  return null;
}

export function isExchangeSparkFeatureUnavailable(errorCode?: string | null): boolean {
  return errorCode === "MEDIA_PLATFORM_DISABLED"
    || errorCode === "MEDIA_STORAGE_UNAVAILABLE"
    || errorCode === "MEDIA_PROCESSING_UNAVAILABLE";
}