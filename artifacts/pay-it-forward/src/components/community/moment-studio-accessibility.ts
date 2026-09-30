import { persistStudioDraft, saveStudioDraft, type StudioDraft } from "./story-studio-draft";

export const MOMENT_ACCESSIBILITY_MAX_ALT_LENGTH = 250;
export const MOMENT_ACCESSIBILITY_MAX_VTT_BYTES = 64 * 1024;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

export type MomentStudioAccessibilityDraft = {
  momentTagsInput: string;
  momentAltTexts: Record<number, string>;
  momentCaptionsVtt: Record<number, string>;
};

export type MomentMediaAccessibilityPayload = {
  media_asset_id: number;
  alt_text: string;
  captions_vtt?: string;
};

export const emptyMomentStudioAccessibility = (): MomentStudioAccessibilityDraft => ({
  momentTagsInput: "",
  momentAltTexts: {},
  momentCaptionsVtt: {},
});

export function restoreMomentStudioAccessibility(value: unknown): MomentStudioAccessibilityDraft {
  const draft = value && typeof value === "object" ? value as Partial<MomentStudioAccessibilityDraft> : {};
  return {
    momentTagsInput: typeof draft.momentTagsInput === "string" ? draft.momentTagsInput.slice(0, 320) : "",
    momentAltTexts: Object.fromEntries(Object.entries(draft.momentAltTexts ?? {})
      .filter(([key, text]) => /^\d+$/.test(key) && typeof text === "string")
      .map(([key, text]) => [Number(key), text.slice(0, MOMENT_ACCESSIBILITY_MAX_ALT_LENGTH)])),
    momentCaptionsVtt: Object.fromEntries(Object.entries(draft.momentCaptionsVtt ?? {})
      .filter(([key, text]) => /^\d+$/.test(key) && typeof text === "string")
      .map(([key, text]) => [Number(key), text.slice(0, MOMENT_ACCESSIBILITY_MAX_VTT_BYTES)])),
  };
}

export async function persistMomentStudioDraft(draft: StudioDraft): Promise<void> {
  const accessibility = restoreMomentStudioAccessibility(draft);
  const hasAccessibilityDraft = accessibility.momentTagsInput.trim().length > 0
    || Object.values(accessibility.momentAltTexts).some((text) => text.trim().length > 0)
    || Object.values(accessibility.momentCaptionsVtt).some((text) => text.trim().length > 0);
  if (hasAccessibilityDraft && !draft.files.length && !draft.caption.trim() && !draft.elements.length && !draft.exchangeDraftId && !draft.musicFile) {
    await saveStudioDraft({ ...draft, ...accessibility });
    return;
  }
  await persistStudioDraft(draft);
}

export function parseMomentStudioTags(value: string): string[] {
  const rawTags = value.split(",").map((tag) => tag.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
  if (rawTags.length > MAX_TAGS) throw new Error("Add no more than 10 Moment tags.");
  if (rawTags.some((tag) => tag.length > MAX_TAG_LENGTH || !/^[a-z0-9][a-z0-9-]*$/.test(tag))) {
    throw new Error("Tags must be 1–30 letters, numbers, or hyphens.");
  }
  if (new Set(rawTags).size !== rawTags.length) throw new Error("Moment tags must be unique.");
  return rawTags;
}

function timestampSeconds(value: string): number | null {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

export function validateMomentStudioWebVtt(value: string, videoDurationMs?: number | null): string | null {
  if (new TextEncoder().encode(value).byteLength > MOMENT_ACCESSIBILITY_MAX_VTT_BYTES) {
    return "Video captions must be 64 KiB or smaller.";
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return "Video captions contain unsupported control characters.";
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!/^WEBVTT(?:\n\n|\n(?=\d{2}:)|$)/.test(normalized)) return "Caption cues need a WEBVTT header.";
  const cues = normalized.replace(/^WEBVTT(?:[^\n]*)\n?/, "").trim().split(/\n{2,}/).filter(Boolean);
  if (!cues.length || cues.length > 100) return "Add between 1 and 100 caption cues.";
  const durationLimit = Math.min(60, videoDurationMs == null ? 60 : videoDurationMs / 1000);
  for (const cue of cues) {
    const lines = cue.split("\n");
    const timing = /^((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}) --> ((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})$/.exec(lines.shift() ?? "");
    if (!timing || !lines.length) return "Each caption cue needs a valid start/end time and text.";
    const start = timestampSeconds(timing[1]);
    const end = timestampSeconds(timing[2]);
    if (start === null || end === null || end <= start || end > durationLimit) {
      return "Caption cue times must be increasing and within this video (up to 60 seconds).";
    }
    const text = lines.join("\n").trim();
    if (!text || text.length > 500 || /[<>]|-->|[\u0000-\u001f\u007f]/.test(text)) {
      return "Caption cue text must be plain text, up to 500 characters per cue.";
    }
  }
  return null;
}

export function buildMomentMediaAccessibility(
  files: File[],
  selectedIndexes: number[],
  orderedAssetIds: number[],
  altTexts: Record<number, string>,
  captions: Record<number, string>,
): MomentMediaAccessibilityPayload[] {
  if (selectedIndexes.length !== orderedAssetIds.length) throw new Error("Moment media descriptions did not match the selected attachment order.");
  return selectedIndexes.flatMap((fileIndex, position) => {
    const file = files[fileIndex];
    if (!file || !(file.type.startsWith("image/") || file.type.startsWith("video/"))) return [];
    const altText = (altTexts[fileIndex] ?? "").trim();
    if (!altText) throw new Error(`Add alternative text for attachment ${position + 1}.`);
    if (altText.length > MOMENT_ACCESSIBILITY_MAX_ALT_LENGTH) {
      throw new Error(`Alternative text for attachment ${position + 1} must be 250 characters or fewer.`);
    }
    const captionsVtt = (captions[fileIndex] ?? "").replace(/\r\n?/g, "\n").trim();
    if (file.type.startsWith("video/") && captionsVtt) {
      const captionError = validateMomentStudioWebVtt(captionsVtt);
      if (captionError) throw new Error(captionError);
    }
    return [{
      media_asset_id: orderedAssetIds[position],
      alt_text: altText,
      ...(file.type.startsWith("video/") && captionsVtt ? { captions_vtt: captionsVtt } : {}),
    }];
  });
}