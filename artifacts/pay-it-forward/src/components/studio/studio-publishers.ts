import {
  ExchangeSparkUploadError,
  clearExchangeSparkDraftId,
  completeSparkUpload,
  createExchangeSparkDraft,
  createSparkUploadSession,
  getExchangeSparkDraftStatus,
  publishExchangeSparkDraft,
  putRawSparkFile,
  resumeSparkUploadSession,
  saveExchangeSparkDraftId,
  updateExchangeSparkDraftCaption,
  waitForExchangeSparkMediaReady,
} from "@/lib/exchange-spark-upload-client";
import { EXCHANGE_SPARK_UPLOAD_ATTEMPTS } from "@/lib/exchange-spark-upload-rules";
import { saveSparkAsPrivateFamilyStory } from "../community/community-spark-family-archive";
import {
  discardStudioDraft,
  newStudioPublishId,
  exchangeResumeAction,
  loadStudioDraft,
  persistStudioPublishAttempt,
  saveStudioDraft,
  studioDraftKey,
  studioFileFingerprint,
  studioPublishSignature,
  type StudioDraft,
} from "../community/story-studio-draft";
import { publishStudioMoment } from "../community/story-studio-publish";
import { itemKind, momentCutdownIds, needsFamilyOriginalOffer, type StudioItem } from "./studio-policy";

export type StudioScope = { userId: number; hubId: number | null; audience: "community" | "hub" };
export type StudioProgress = (label: string, percent: number) => void;

/**
 * Publishes through the existing, certified Moment contract. The Studio UI
 * changes; the upload ladder, publish identity, draft barrier and camera-reel
 * stitching do not. A CameraClipReelPendingError propagates unchanged so the
 * host can run its existing retry flow.
 */
export async function publishStudioItemsAsMoment(input: {
  scope: StudioScope;
  items: StudioItem[];
  caption: string;
  clientPublishId?: string;
  responseToStoryId?: number | null;
  challengeKey?: string | null;
  signal: AbortSignal;
  onProgress: StudioProgress;
}): Promise<number> {
  const { scope, signal } = input;
  const clientPublishId = input.clientPublishId ?? newStudioPublishId();
  const keep = new Set(momentCutdownIds(input.items));
  const momentItems = input.items.filter((item) => keep.has(item.id));
  const files = momentItems.map((item) => item.file);
  const selection = files.map((_, index) => index);
  const coverTimes: Record<number, number> = {};
  momentItems.forEach((item, index) => { if (item.kind === "video" && item.coverTimeMs > 0) coverTimes[index] = item.coverTimeMs; });
  const attemptedSignature = studioPublishSignature({
    files, selection, caption: input.caption, elements: [], audience: scope.audience, hubId: scope.hubId, textBackground: "", coverTimes,
  });
  const base: StudioDraft = {
    id: studioDraftKey(scope.userId, scope.hubId),
    userId: scope.userId,
    contextKind: scope.hubId === null ? "community_moment" : "hub_moment",
    contextId: scope.hubId ?? scope.userId,
    caption: input.caption,
    files,
    updatedAt: Date.now(),
    selection,
    previewIndex: 0,
    audience: scope.audience,
    destinationListingId: "",
    elements: [],
    effect: "none",
    textBackground: "",
    textColor: "#ffffff",
    textSize: "18",
    textAlign: "center",
    trimPreview: {},
    coverTimes,
    clientPublishId,
    attemptedSignature,
  };
  const cameraClipReel = momentItems.length >= 2 && momentItems.every((item) => item.source === "camera" && item.kind === "video");

  const storyId = await publishStudioMoment({
    userId: scope.userId,
    hubId: scope.hubId,
    audience: scope.audience,
    clientPublishId,
    files,
    caption: input.caption,
    elements: [],
    effect: "none",
    signal,
    cameraClipReel,
    responseToStoryId: input.responseToStoryId ?? null,
    challengeKey: input.challengeKey ?? null,
    mediaEdits: momentItems.flatMap((item, index) => (item.kind === "video" && item.coverTimeMs > 0 ? [{ index, coverTimeMs: item.coverTimeMs }] : [])),
    onStatus: input.onProgress,
    // Mandatory durability barrier: ordered asset ids + publish identity hit IndexedDB before the POST.
    beforePublish: async (orderedAssetIds) => { await persistStudioPublishAttempt(base, selection, orderedAssetIds); },
  });
  await discardStudioDraft(scope.userId, scope.hubId);
  return storyId;
}

/** Exchange Spark: one listing-owned video. Same server ladder as the legacy composer, minus its form UI. */
export async function publishStudioItemAsExchangeSpark(input: {
  scope: StudioScope;
  listingId: number;
  item: StudioItem;
  caption: string;
  signal: AbortSignal;
  onProgress: StudioProgress;
}): Promise<"published" | "pending"> {
  const { item, signal } = input;
  if (item.kind !== "video") throw new Error("Exchange Sparks are a single video.");
  try {
    const fingerprint = studioFileFingerprint(item.file);
    const stored = await loadStudioDraft(input.scope.userId, input.scope.hubId);
    let remoteId = stored?.exchangeDraftId ?? null;
    let savedListingId = stored?.destinationListingId ? Number(stored.destinationListingId) : input.listingId;
    let savedFingerprint = stored?.exchangeFileFingerprint;
    let draftState: StudioDraft = stored ?? {
      id: studioDraftKey(input.scope.userId, input.scope.hubId),
      userId: input.scope.userId,
      contextKind: input.scope.hubId === null ? "community_moment" : "hub_moment",
      contextId: input.scope.hubId ?? input.scope.userId,
      caption: input.caption,
      files: [item.file],
      updatedAt: Date.now(),
      selection: [0],
      previewIndex: 0,
      audience: input.scope.audience,
      destinationListingId: String(input.listingId),
      elements: [],
      effect: "none",
      textBackground: "",
      textColor: "#ffffff",
      textSize: "18",
      textAlign: "center",
      trimPreview: {},
    };
    draftState = { ...draftState, caption: input.caption, files: [item.file], selection: [0], audience: input.scope.audience, destinationListingId: String(input.listingId), updatedAt: Date.now() };
    let status: Awaited<ReturnType<typeof getExchangeSparkDraftStatus>> | null = null;
    let action: ReturnType<typeof exchangeResumeAction>;
    if (remoteId === null) {
      input.onProgress("Creating your Spark draft…", 2);
      const draft = await createExchangeSparkDraft(input.listingId, input.caption.trim(), signal);
      if (draft.upload_context.contextKind !== "exchange_spark" || draft.upload_context.contextId !== draft.spark_id) {
        throw new Error("The server returned an invalid Spark upload context.");
      }
      remoteId = draft.spark_id;
      savedListingId = input.listingId;
      savedFingerprint = fingerprint;
      draftState = { ...draftState, exchangeDraftId: remoteId, exchangeFileFingerprint: fingerprint };
      await saveStudioDraft(draftState);
      try { saveExchangeSparkDraftId(remoteId); } catch { /* IndexedDB remains the recovery authority. */ }
      action = "create-upload";
    } else {
      try { status = await getExchangeSparkDraftStatus(remoteId, signal); }
      catch (reason) {
        if (!(reason instanceof ExchangeSparkUploadError && reason.status === 404)) throw reason;
      }
      action = exchangeResumeAction({
        draftId: remoteId,
        listingId: input.listingId,
        savedListingId,
        fingerprint,
        savedFingerprint,
        status,
        file: item.file,
      });
    }
    if (action === "create") throw new Error("The Exchange draft could not be created safely.");
    if (status && status.caption !== input.caption.trim()) await updateExchangeSparkDraftCaption(remoteId, input.caption.trim(), signal);
    draftState = { ...draftState, exchangeDraftId: remoteId, exchangeFileFingerprint: fingerprint, caption: input.caption, updatedAt: Date.now() };
    await saveStudioDraft(draftState);
    if (action === "create-upload" || action === "resume-upload") {
      const asset = status?.media_assets[0];
      if (asset?.status === "failed") {
        await completeSparkUpload(`/api/media-assets/${asset.media_asset_id}/complete`, signal);
      } else {
        const session = asset
          ? resumeSparkUploadSession(asset.media_asset_id, item.file)
          : await createSparkUploadSession({ contextId: remoteId, file: item.file, signal });
        input.onProgress("Preparing secure upload…", 5);
        let lastFailure: unknown;
        let uploaded = false;
        for (let attempt = 1; attempt <= EXCHANGE_SPARK_UPLOAD_ATTEMPTS && !uploaded; attempt++) {
          try {
            await putRawSparkFile(session.upload, item.file, signal, (loaded, total) => {
              input.onProgress(attempt === 1 ? "Uploading…" : `Retrying upload (${attempt} of ${EXCHANGE_SPARK_UPLOAD_ATTEMPTS})…`, 5 + (total > 0 ? (loaded / total) * 80 : 0));
            });
            uploaded = true;
          } catch (reason) {
            if (signal.aborted) throw reason;
            lastFailure = reason;
          }
        }
        if (!uploaded) throw lastFailure instanceof Error ? lastFailure : new Error("The video could not be uploaded.");
      }
      input.onProgress("Checking your video…", 88);
      await completeSparkUpload(`/api/media-assets/${status?.media_assets[0]?.media_asset_id ?? ""}/complete`, signal).catch(async (reason) => {
        if (asset?.status === "failed") throw reason;
        // The upload-session completion URL is the authoritative endpoint; the
        // fallback above is intentionally not used when a fresh session exists.
        throw reason;
      });
    }
    if (action === "wait" || action === "create-upload" || action === "resume-upload") {
      await waitForExchangeSparkMediaReady(remoteId, signal, () => input.onProgress("Processing video…", 94));
    }
    input.onProgress("Publishing…", 98);
    const result = await publishExchangeSparkDraft(remoteId, input.caption.trim(), signal);
    if (result.status !== "published" && result.status !== "pending") throw new Error("The server returned an unknown Spark publication status.");
    await discardStudioDraft(input.scope.userId, input.scope.hubId);
    try { clearExchangeSparkDraftId(); } catch { /* IndexedDB was already cleared. */ }
    return result.status;
  } catch (reason) {
    throw reason instanceof ExchangeSparkUploadError || reason instanceof Error ? reason : new Error("Your Exchange Spark could not be published.");
  }
}

/** Explicit, separate private copy of the ORIGINAL files. Never reuses an expiring Moment URL. */
export async function saveStudioOriginalsToFamily(input: {
  familyId: number;
  archiveId: string;
  caption: string;
  items: StudioItem[];
  signal: AbortSignal;
  onProgress: StudioProgress;
}): Promise<void> {
  await saveSparkAsPrivateFamilyStory({
    familyId: input.familyId,
    archiveId: input.archiveId,
    caption: input.caption,
    files: input.items.map((item) => item.file),
    signal: input.signal,
    onProgress: (message) => input.onProgress(message, 50),
  });
}

export const shouldOfferFamilyOriginal = needsFamilyOriginalOffer;
export { itemKind };
