import { useEffect, useState } from "react";
import { STORY_MEDIA_LIMITS, validateStoryMedia } from "@/lib/storyMediaPipeline";
import { EXCHANGE_SPARK_MAX_BYTES } from "@/lib/exchange-spark-upload-rules";

export function validateStoryFile(file: File): string | null {
  const result = validateStoryMedia(file);
  return result.ok ? null : result.error;
}

export function validateStoryFileCount(files: File[]): string | null {
  return files.length > STORY_MEDIA_LIMITS.maxFiles
    ? `Choose ${STORY_MEDIA_LIMITS.maxFiles} or fewer Story items.`
    : null;
}

export function normalizeStoryFiles(files: File[], options: { allowExchangeVideo?: boolean } = {}) {
  const errors: string[] = [];
  const accepted: File[] = [];
  const countError = validateStoryFileCount(files);
  if (countError) errors.push(countError);
  for (const file of files) {
    const error = validateStoryFile(file);
    const exchangeVideo = options.allowExchangeVideo
      && (file.type === "video/mp4" || file.type === "video/webm")
      && file.size > 0 && file.size <= EXCHANGE_SPARK_MAX_BYTES;
    if (error && !exchangeVideo) {
      errors.push(`${file.name}: ${options.allowExchangeVideo && file.type.startsWith("video/")
        ? "Choose an MP4 or WebM video no larger than 64 MiB for Exchange, or a smaller clip for Moments."
        : error}`);
    }
    else accepted.push(file);
  }
  return { files: accepted.slice(0, STORY_MEDIA_LIMITS.maxFiles), errors };
}

function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(duration);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      finish(duration);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/**
 * Video duration is checked before encoding so a rejected Story does not
 * spend bandwidth uploading a file the server will refuse.
 */
export async function validateStoryFiles(files: File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files.slice(0, STORY_MEDIA_LIMITS.maxFiles)) {
    const typeError = validateStoryFile(file);
    if (typeError) {
      errors.push(`${file.name}: ${typeError}`);
      continue;
    }
    if (!file.type.startsWith("video/")) continue;
    const duration = await readVideoDuration(file);
    if (duration === null) {
      errors.push(`${file.name}: The video could not be inspected. Please choose another clip.`);
    } else if (duration > STORY_MEDIA_LIMITS.videoMaxSeconds) {
      errors.push(`${file.name}: Story videos must be 60 seconds or shorter.`);
    }
  }
  return errors;
}

/**
 * Creates a local preview URL after the file changes and always revokes it
 * when the file is replaced or the composer unmounts.
 */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
      setUrl((current) => (current === nextUrl ? null : current));
    };
  }, [file]);

  return url;
}

/**
 * Creates one preview URL per selected file and revokes the complete batch
 * when the selection changes or the composer unmounts.
 */
export function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const nextUrls = files.map((file) => URL.createObjectURL(file));
    setUrls(nextUrls);
    return () => {
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
      setUrls((current) => (current === nextUrls ? [] : current));
    };
  }, [files]);

  return urls;
}

/** Creates a revocable same-document WebVTT URL for the native video track. */
export function useWebVttObjectUrl(value: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const source = value.trim();
    if (!source) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(new Blob([source], { type: "text/vtt;charset=utf-8" }));
    setUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
      setUrl((current) => current === nextUrl ? null : current);
    };
  }, [value]);

  return url;
}