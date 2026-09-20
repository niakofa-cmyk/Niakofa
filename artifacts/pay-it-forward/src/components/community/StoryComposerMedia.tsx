import { useEffect, useState } from "react";
import { STORY_MEDIA_LIMITS, validateStoryMedia } from "@/lib/storyMediaPipeline";

export function validateStoryFile(file: File): string | null {
  const result = validateStoryMedia(file);
  return result.ok ? null : result.error;
}

export function validateStoryFileCount(files: File[]): string | null {
  return files.length > STORY_MEDIA_LIMITS.maxFiles
    ? `Choose ${STORY_MEDIA_LIMITS.maxFiles} or fewer Story items.`
    : null;
}

export function normalizeStoryFiles(files: File[]) {
  const errors: string[] = [];
  const accepted: File[] = [];
  const countError = validateStoryFileCount(files);
  if (countError) errors.push(countError);
  for (const file of files) {
    const error = validateStoryFile(file);
    if (error) errors.push(`${file.name}: ${error}`);
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