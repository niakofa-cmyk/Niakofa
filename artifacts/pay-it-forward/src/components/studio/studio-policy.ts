/**
 * Single source of truth for Media Studio limits and destination rules.
 * Pure (no DOM, no network) so it is unit-testable and shared by every
 * surface: camera, gallery, review, and the destination sheet.
 *
 * Values mirror the existing contracts (story-camera-utils,
 * community-spark-family-archive, exchange-spark-upload-rules). If a product
 * decision changes a cap, change it here and in those modules together.
 */
export const STUDIO_MAX_ITEMS = 6;
export const CAMERA_CLIP_MAX_MS = 60_000;
export const MOMENT_TOTAL_MAX_MS = 180_000;
/** Above this combined video length the Studio offers a private Family Story original. */
export const FAMILY_ORIGINAL_OFFER_MS = MOMENT_TOTAL_MAX_MS;
export const SPARK_VIDEO_MAX_MS = 180_000;
export const MEDIA_MAX_BYTES = 64 * 1024 * 1024;
export const FAMILY_FILE_MAX_BYTES = 20 * 1024 * 1024;

export type StudioDestination = "moment" | "exchange_spark" | "family_story";

export type StudioItem = {
  id: string;
  file: File;
  kind: "photo" | "video";
  durationMs: number | null;
  source: "camera" | "gallery";
  coverTimeMs: number;
};

export type DestinationState = { ok: boolean; reason?: string; note?: string };

export function itemKind(file: Pick<File, "type">): "photo" | "video" {
  return file.type.startsWith("video/") ? "video" : "photo";
}

export function totalVideoMs(items: readonly StudioItem[]): number {
  return items.reduce((sum, item) => (item.kind === "video" ? sum + (item.durationMs ?? 0) : sum), 0);
}

/** Recording budget left for the next camera clip. */
export function remainingCaptureMs(items: readonly StudioItem[]): number {
  return Math.max(0, Math.min(CAMERA_CLIP_MAX_MS, MOMENT_TOTAL_MAX_MS - totalVideoMs(items)));
}

export function canAddItem(items: readonly StudioItem[]): boolean {
  return items.length < STUDIO_MAX_ITEMS;
}

export function needsFamilyOriginalOffer(items: readonly StudioItem[]): boolean {
  return totalVideoMs(items) > FAMILY_ORIGINAL_OFFER_MS;
}

export function destinationAvailability(
  items: readonly StudioItem[],
  context: { hasExchangeListing: boolean; hasFamilySpace: boolean },
): Record<StudioDestination, DestinationState> {
  const hasMedia = items.length > 0;
  const videos = items.filter((item) => item.kind === "video");
  const overMoment = totalVideoMs(items) > MOMENT_TOTAL_MAX_MS;
  const oversize = items.some((item) => item.file.size > MEDIA_MAX_BYTES);

  const cut = momentCutdownIds(items);
  const moment: DestinationState = !hasMedia
    ? { ok: false, reason: "Add a photo or video first." }
    : oversize ? { ok: false, reason: "An item is larger than 64 MB." }
    : overMoment && cut.length === 0 ? { ok: false, reason: "The first video is longer than 3 minutes. Trim it, or save it privately as a Family Story." }
    : overMoment ? { ok: true, note: "Over 3 minutes: your Moment uses the earliest clips that fit. Originals are never changed." }
    : { ok: true };

  const exchange: DestinationState = !context.hasExchangeListing
    ? { ok: false, reason: "Open Studio from one of your Exchange listings to share a Spark there." }
    : items.length !== 1 || videos.length !== 1 ? { ok: false, reason: "Exchange Sparks are a single video." }
    : (videos[0].durationMs ?? Infinity) > SPARK_VIDEO_MAX_MS ? { ok: false, reason: "Exchange Sparks are 3 minutes or shorter." }
    : !["video/mp4", "video/webm"].includes(videos[0].file.type) ? { ok: false, reason: "Choose an MP4 or WebM video." }
    : videos[0].file.size > MEDIA_MAX_BYTES ? { ok: false, reason: "Video must be 64 MB or smaller." }
    : { ok: true };

  const family: DestinationState = !hasMedia
    ? { ok: false, reason: "Add a photo or video first." }
    : !context.hasFamilySpace ? { ok: false, reason: "Join or create a Family Space to keep originals privately." }
    : items.some((item) => item.file.size > FAMILY_FILE_MAX_BYTES) ? { ok: false, reason: "Family Story items must be 20 MB or smaller." }
    : { ok: true };

  return { moment, exchange_spark: exchange, family_story: family };
}

/** Earliest complete clips that fit the Moment cap; photos always kept. Originals are never altered. */
export function momentCutdownIds(items: readonly StudioItem[]): string[] {
  let used = 0;
  const keep: string[] = [];
  for (const item of items) {
    if (item.kind === "photo") { keep.push(item.id); continue; }
    const next = used + (item.durationMs ?? 0);
    if (next > MOMENT_TOTAL_MAX_MS) break;
    used = next;
    keep.push(item.id);
  }
  return keep;
}
