import { deleteCommunityMomentDraft, getCommunityMomentDraft, saveCommunityMomentDraft } from "@/lib/community-moments-upload";
import type { CommunityMomentDraft } from "@/lib/community-moments-upload";
import type { StudioElement } from "./story-studio-publish";

export type StudioDraft = CommunityMomentDraft & {
  exchangeDraftId?: number | null;
  exchangeFileFingerprint?: string;
  clientPublishId?: string;
  attemptedSignature?: string;
  publishAssetIds?: number[];
  selection: number[];
  previewIndex: number;
  audience: "community" | "hub";
  destinationListingId: string;
  elements: StudioElement[];
  effect: "none" | "warmth" | "contrast" | "grayscale" | "vignette";
  textBackground: string;
  textColor: string;
  textSize: string;
  textAlign: "left" | "center" | "right";
  trimPreview: Record<number, { start: number; end: number }>;
  coverTimes?: Record<number, number>;
  uploadedMediaAssetIds?: number[];
};

export const studioFileFingerprint = (file: File) => `${file.name}\u0000${file.size}\u0000${file.type}\u0000${file.lastModified}`;
export const newStudioPublishId = () => crypto.randomUUID();

/** Preview-only controls are excluded; persistent cover edits are part of the published content. */
export function studioPublishSignature(input: {
  files: File[]; selection: number[]; caption: string; elements: StudioElement[];
  audience: "community" | "hub"; hubId: number | null; textBackground: string; coverTimes?: Record<number, number>;
}): string {
  return JSON.stringify({
    files: input.selection.filter((index) => Number.isInteger(index) && index >= 0 && index < input.files.length)
      .map((index) => studioFileFingerprint(input.files[index])),
    caption: input.caption.trim(), elements: input.elements,
    audience: input.audience, hubId: input.audience === "hub" ? input.hubId : null,
    background: input.selection.length ? null : input.textBackground,
    coverTimes: input.coverTimes ?? {},
  });
}

/** Never create a second durable Spark while a server-owned draft is referenced. */
export function exchangeResumeAction(input: {
  draftId: number | null;
  listingId: number;
  savedListingId: number;
  fingerprint: string;
  savedFingerprint?: string;
  status?: { listing_id: number; media_assets: Array<{ media_asset_id: number; media_type: string; mime_type: string; byte_size: number; status: string; variant_ready: boolean }> } | null;
  file: File;
}): "create" | "publish-again" | "create-upload" | "resume-upload" | "wait" | "publish" {
  if (!input.draftId) return "create";
  if (input.listingId !== input.savedListingId || input.fingerprint !== input.savedFingerprint) {
    throw new Error("This Exchange draft belongs to another listing or video. Resume the original, or explicitly discard it before starting a new one.");
  }
  // The draft status endpoint only returns active drafts. Published Sparks are
  // resolved by retrying the idempotent publish endpoint using the SAME id.
  if (!input.status) return "publish-again";
  if (input.status.listing_id !== input.listingId || input.status.media_assets.length > 1) {
    throw new Error("The server-owned Exchange draft does not match this video. Discard it explicitly before starting again.");
  }
  const asset = input.status.media_assets[0];
  if (!asset) return "create-upload";
  if (asset.media_type !== "video" || asset.mime_type !== input.file.type || asset.byte_size !== input.file.size) {
    throw new Error("The uploaded Exchange video does not match this draft. Discard the draft explicitly to start over.");
  }
  if (asset.status === "ready" && asset.variant_ready) return "publish";
  if (asset.status === "ready" || asset.status === "processing" || asset.status === "uploaded") return "wait";
  return "resume-upload";
}

export const studioDraftKey = (userId: number, hubId: number | null) => `studio:${userId}:${hubId ?? "community"}`;

export function emptyStudioScope(hubId: number | null) {
  return {
    files: [] as File[],
    selection: [] as number[],
    audience: (hubId === null ? "community" : "hub") as "community" | "hub",
    uploadedIds: [] as number[],
    listingId: "",
    caption: "",
  };
}

export async function saveStudioDraft(draft: StudioDraft) {
  await saveCommunityMomentDraft(draft);
}

/** IndexedDB transaction completion is a mandatory publication barrier. */
export async function persistStudioPublishAttempt(
  draft: StudioDraft,
  selectedIndexes: number[],
  orderedAssetIds: number[],
): Promise<StudioDraft> {
  if (!draft.clientPublishId || !draft.attemptedSignature || selectedIndexes.length !== orderedAssetIds.length
    || selectedIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= draft.files.length)
    || orderedAssetIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(orderedAssetIds).size !== orderedAssetIds.length) {
    throw new Error("The Spark upload sequence could not be saved safely. Nothing was published.");
  }
  const slots = Array.from({ length: draft.files.length }, (_, index) => draft.uploadedMediaAssetIds?.[index] ?? 0);
  selectedIndexes.forEach((index, position) => { slots[index] = orderedAssetIds[position]; });
  const durable = { ...draft, uploadedMediaAssetIds: slots, publishAssetIds: [...orderedAssetIds], updatedAt: Date.now() };
  try {
    await saveStudioDraft(durable);
  } catch (reason) {
    throw new Error(`Nothing was published: the Spark identity and uploaded media could not be saved on this device. ${reason instanceof Error ? reason.message : "Storage unavailable."}`);
  }
  return durable;
}

export async function persistStudioDraft(draft: StudioDraft): Promise<void> {
  if (!draft.files.length && !draft.caption.trim() && !draft.elements.length && !draft.exchangeDraftId) {
    await discardStudioDraft(draft.userId, draft.contextKind === "hub_moment" ? draft.contextId : null);
    return;
  }
  await saveStudioDraft(draft);
}

export async function loadStudioDraft(userId: number, hubId: number | null): Promise<StudioDraft | null> {
  if (!Number.isSafeInteger(userId) || userId < 1) return null;
  const draft = await getCommunityMomentDraft(studioDraftKey(userId, hubId), userId) as StudioDraft | null;
  return draft?.contextId === (hubId ?? userId) && draft?.contextKind === (hubId === null ? "community_moment" : "hub_moment") ? draft : null;
}

export async function discardStudioDraft(userId: number, hubId: number | null) {
  await deleteCommunityMomentDraft(studioDraftKey(userId, hubId), userId);
}