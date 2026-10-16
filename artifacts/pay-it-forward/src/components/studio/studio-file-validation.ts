import { MEDIA_MAX_BYTES } from "./studio-policy";

/** Early feedback only. The server still validates all uploaded bytes and metadata. */
export async function validateStudioFile(file: File): Promise<void> {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MEDIA_MAX_BYTES) {
    throw new Error("Choose a media file between 1 byte and 64 MiB.");
  }
  const mime = file.type.split(";", 1)[0].trim().toLowerCase();
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const matches: Record<string, boolean> = {
    "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte),
    "image/gif": ["GIF87a", "GIF89a"].includes(text(0, 6)),
    "image/webp": text(0, 4) === "RIFF" && text(8, 12) === "WEBP",
    "video/mp4": text(4, 16).includes("ftyp"),
    "video/webm": [0x1a, 0x45, 0xdf, 0xa3].every((byte, i) => bytes[i] === byte),
  };
  if (!(mime in matches)) throw new Error("Choose a JPEG, PNG, WebP, GIF, MP4, or WebM file.");
  if (!matches[mime]) {
    throw new Error("This file's contents don't match its media type. Choose the original photo or video, not a renamed file.");
  }
}
