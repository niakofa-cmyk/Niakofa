const MAX_MOMENT_VIDEO_SECONDS = 60;
const MAX_VTT_BYTES = 64 * 1024;
const MAX_VTT_CUES = 100;
const MAX_CUE_TEXT_LENGTH = 500;

function vttTimestampSeconds(value: string): number | null {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * Accept a deliberately restricted, plain-text WebVTT subset. This keeps
 * creator captions usable as native video tracks without accepting markup,
 * scriptable cue settings, or unbounded cue/timing data.
 */
export function validateMomentCaptionsVtt(value: string, maxDurationSeconds = MAX_MOMENT_VIDEO_SECONDS): string | null {
  if (Buffer.byteLength(value, "utf8") > MAX_VTT_BYTES) return "Video captions must be 64 KiB or smaller.";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return "Video captions contain unsupported control characters.";
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!/^WEBVTT(?:\n\n|\n(?=\d{2}:)|$)/.test(normalized)) return "Video captions must use a WEBVTT header.";
  const body = normalized.replace(/^WEBVTT(?:[^\n]*)\n?/, "").trim();
  const cues = body.split(/\n{2,}/).filter(Boolean);
  if (!cues.length || cues.length > MAX_VTT_CUES) return "Add between 1 and 100 caption cues.";

  for (const cue of cues) {
    const lines = cue.split("\n");
    const timing = lines.shift() ?? "";
    const match = /^((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}) --> ((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})$/.exec(timing);
    if (!match || !lines.length) return "Each caption cue needs a valid start/end time and text.";
    const start = vttTimestampSeconds(match[1]);
    const end = vttTimestampSeconds(match[2]);
    if (start === null || end === null || end <= start || end > Math.min(MAX_MOMENT_VIDEO_SECONDS, maxDurationSeconds)) {
      return "Caption cue times must be increasing and within the video duration (up to 60 seconds).";
    }
    const text = lines.join("\n").trim();
    if (!text || text.length > MAX_CUE_TEXT_LENGTH || /[<>]|-->|[\u0000-\u001f\u007f]/.test(text)) {
      return "Caption cue text must be plain text, up to 500 characters per cue.";
    }
  }
  return null;
}

export function escapeMomentSearchTerm(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * New ordinary Moments require creator-supplied descriptions for every visual
 * attachment. Keep the Exchange exemption explicit because that separate
 * publish flow predates Moment accessibility metadata.
 */
export function validateNewMomentVisualAltText(
  media: Array<{ media_type: string; alt_text?: string | null }>,
  exchangeLinked: boolean,
): string | null {
  if (exchangeLinked) return null;
  for (const item of media) {
    if (item.media_type !== "photo" && item.media_type !== "video") continue;
    const altText = typeof item.alt_text === "string"
      ? item.alt_text.replace(/[\u0000-\u001f\u007f]/g, "").trim()
      : "";
    if (!altText) return "Alternative text is required for every photo and video attachment.";
    if (item.alt_text!.trim().length > 250) return "Alternative text must be 250 characters or fewer.";
  }
  return null;
}