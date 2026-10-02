const RECORDING_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "video/webm": "webm",
  "video/mp4": "mp4",
};

/** The type stored with a Spiral recording. An unknown type is rejected so a
 * video take is not archived as audio/webm and played back blank. */
export function recordingArchiveType(contentType: string | undefined): { mimeType: string; extension: string } | null {
  const mimeType = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType) return { mimeType: "audio/webm", extension: "webm" };
  const extension = RECORDING_EXTENSIONS[mimeType];
  return extension ? { mimeType, extension } : null;
}
