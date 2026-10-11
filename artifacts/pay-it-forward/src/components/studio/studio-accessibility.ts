import type { StudioItem } from "./studio-policy";

/** Mirrors MOMENT_ACCESSIBILITY_MAX_ALT_LENGTH in ../community/moment-studio-accessibility (pinned by a test). */
export const ALT_TEXT_MAX = 250;

export type AccessibilityIssue = { itemId: string; position: number; message: string };

/**
 * Moments REQUIRE alternative text for every photo and video (the publish contract throws without it),
 * and optional WebVTT captions for video. This is the single check the Studio runs before it lets
 * someone share, so the failure shows up on the preview screen instead of after a full upload.
 * `validateVtt` is injected so this stays pure and testable.
 */
export function momentAccessibilityIssues(
  items: readonly StudioItem[],
  validateVtt: (vtt: string, durationMs: number | null) => string | null,
): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  items.forEach((item, index) => {
    const position = index + 1;
    const label = `${item.kind === "video" ? "Video" : "Photo"} ${position}`;
    const alt = (item.altText ?? "").trim();
    if (!alt) issues.push({ itemId: item.id, position, message: `Describe ${label.toLowerCase()} for people who can't see it.` });
    else if (alt.length > ALT_TEXT_MAX) issues.push({ itemId: item.id, position, message: `${label}: keep the description to ${ALT_TEXT_MAX} characters.` });
    const vtt = (item.captionsVtt ?? "").trim();
    if (item.kind === "video" && vtt) {
      const problem = validateVtt(vtt, item.durationMs);
      if (problem) issues.push({ itemId: item.id, position, message: `${label} captions: ${problem}` });
    }
  });
  return issues;
}

/** Arrays aligned to the files actually published (after any over-cap cut-down), as publishStudioMoment expects. */
export function accessibilityArrays(kept: readonly StudioItem[]): { mediaAltTexts: string[]; mediaCaptionsVtt: string[] } {
  return {
    mediaAltTexts: kept.map((item) => (item.altText ?? "").trim()),
    mediaCaptionsVtt: kept.map((item) => (item.kind === "video" ? (item.captionsVtt ?? "").trim() : "")),
  };
}

export const missingAltIds = (items: readonly StudioItem[]): Set<string> =>
  new Set(items.filter((item) => !(item.altText ?? "").trim()).map((item) => item.id));
