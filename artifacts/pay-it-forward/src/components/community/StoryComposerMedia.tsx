import { useEffect, useState } from "react";

const MAX_FILES = 6;
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 60;
const ACCEPTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

export function validateStoryFile(file: File): string | null {
  if (!ACCEPTED_MEDIA_TYPES.has(file.type)) {
    return "Use a JPG, PNG, WebP, GIF, MP4, or WebM file for a Story.";
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return "That file is too large. Maximum is 12 MB.";
  }
  return null;
}

export function normalizeStoryFiles(files: File[]) {
  const errors: string[] = [];
  const accepted: File[] = [];
  for (const file of files) {
    const error = validateStoryFile(file);
    if (error) errors.push(`${file.name}: ${error}`);
    else accepted.push(file);
  }
  return { files: accepted.slice(0, MAX_FILES), errors };
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
  for (const file of files.slice(0, MAX_FILES)) {
    const typeError = validateStoryFile(file);
    if (typeError) {
      errors.push(`${file.name}: ${typeError}`);
      continue;
    }
    if (!file.type.startsWith("video/")) continue;
    const duration = await readVideoDuration(file);
    if (duration === null) {
      errors.push(`${file.name}: The video could not be inspected. Please choose another clip.`);
    } else if (duration > MAX_VIDEO_DURATION_SECONDS) {
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