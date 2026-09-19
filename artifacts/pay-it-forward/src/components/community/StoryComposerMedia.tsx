import { useEffect, useState } from "react";

const MAX_FILES = 6;
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;

export function validateStoryFile(file: File): string | null {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return "Only image and video files can be used in a Story.";
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