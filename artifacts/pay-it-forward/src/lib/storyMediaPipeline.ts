export type StoryMediaKind = "image" | "video";

export type StoryMediaValidation = {
  kind: StoryMediaKind;
  bytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
};

export const STORY_MEDIA_LIMITS = {
  maxFiles: 6,
  maxBytes: 12 * 1024 * 1024,
  videoMaxSeconds: 60,
} as const;

const ACCEPTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

export function validateStoryMedia(
  file: File,
  metadata: Pick<StoryMediaValidation, "durationSeconds"> = {},
) {
  const kind: StoryMediaKind | null = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : null;

  if (!kind || !ACCEPTED_MEDIA_TYPES.has(file.type)) {
    return { ok: false as const, error: "Use a JPG, PNG, WebP, GIF, MP4, or WebM file for a Story." };
  }
  if (file.size > STORY_MEDIA_LIMITS.maxBytes) {
    return { ok: false as const, error: "That file is too large. Maximum is 12 MB." };
  }
  if (
    kind === "video" &&
    metadata.durationSeconds !== undefined &&
    metadata.durationSeconds > STORY_MEDIA_LIMITS.videoMaxSeconds
  ) {
    return { ok: false as const, error: "Story videos must be 60 seconds or shorter." };
  }
  return { ok: true as const, kind };
}

export async function readStoryMediaMetadata(file: File): Promise<StoryMediaValidation> {
  const result = validateStoryMedia(file);
  if (!result.ok) throw new Error(result.error);

  const url = URL.createObjectURL(file);
  try {
    if (result.kind === "image") {
      const image = new Image();
      image.src = url;
      await image.decode();
      return {
        kind: "image",
        bytes: file.size,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The video could not be inspected. Please choose another clip."));
    });
    const validation = validateStoryMedia(file, { durationSeconds: video.duration });
    if (!validation.ok) throw new Error(validation.error);
    return {
      kind: "video",
      bytes: file.size,
      durationSeconds: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function revokeStoryObjectUrl(url: string | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}